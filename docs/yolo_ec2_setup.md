*# CivicAI — AWS Deployment Guide (EC2-First)

Step-by-step guide to deploy the entire CivicAI system on AWS, **starting from EC2 instance setup**.

> **Region**: Use **`ap-south-1`** (Mumbai) for all services.

---

## Architecture Overview

```
┌──────────┐     ┌─────────────┐     ┌───────────┐     ┌─────────────────┐
│ Frontend │────▶│ API Gateway │────▶│ Lambda 1  │────▶│  S3 Bucket      │
│ (React)  │     │ /upload/    │     │ presign   │     │  civicai-images  │
└──────────┘     │  presign    │     │ URL       │     └────────┬────────┘
                 └─────────────┘     └───────────┘              │
                                                         S3 Event Trigger
                                                                │
                                                     ┌──────────▼──────────┐
                                                     │   Lambda 2          │
                                                     │   process_image     │
                                                     │                     │
                                                     │ 1. Call EC2 YOLO ───┼──▶ EC2 (FastAPI + YOLOv8)
                                                     │ 2. Severity Rules   │
                                                     │ 3. Dept Mapping     │
                                                     │ 4. Bedrock (Claude) │
                                                     │ 5. Save DynamoDB    │
                                                     │ 6. Send SES Email   │
                                                     └─────────────────────┘
```

---

## Pre-requisites

- [x] **Trained YOLO model** — `runs/detect/civicai-gpu/weights/best.pt` (6.3 MB)
- [ ] **AWS Account** with free tier or billing enabled
- [ ] AWS Console access at [console.aws.amazon.com](https://console.aws.amazon.com)

---

## Step 1: Launch EC2 Instance (YOLO Inference Server)

### 1.1 — Launch Instance

1. Go to **EC2** → **Launch instance**
2. Fill in:

   | Setting | Value |
   |---|---|
   | Name | `civicai-yolo-server` |
   | AMI | **Amazon Linux 2023** (free-tier eligible) |
   | Instance type | `t3.medium` (2 vCPU, 4 GB RAM — minimum for YOLO) |
   | Key pair | Click **Create new key pair** → name: `civicai-key` → Type: RSA → Format: `.pem` → **Create** |
   | Storage | 20 GB, gp3 |

3. **Network settings** → Click **Edit** → **Create security group**:

   | Type | Port | Source | Purpose |
   |---|---|---|---|
   | SSH | 22 | My IP | Terminal access |
   | Custom TCP | 8000 | `0.0.0.0/0` | YOLO API endpoint |

4. Click **Launch instance**

> [!TIP]
> Save the downloaded `.pem` key file safely — you need it for SSH.

### 1.2 — Allocate Elastic IP (So IP doesn't change on restart)

1. Go to **EC2** → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**
2. Select the new Elastic IP → **Actions** → **Associate Elastic IP address**
3. Choose your `civicai-yolo-server` instance → **Associate**
4. **Note this IP** — you'll use it everywhere as `<EC2_IP>`

### 1.3 — SSH Into Your Instance

```bash
# On your local machine (PowerShell or Git Bash)
ssh -i civicai-key.pem ec2-user@<EC2_IP>
```

> If you get a permission error on Windows, right-click the .pem file → Properties → Security → Edit → remove all users except your own.

### 1.4 — Install Dependencies on EC2

```bash
# Update system
sudo yum update -y

# Install Python
sudo yum install python3 python3-pip -y

# Install YOLO + FastAPI packages
pip3 install fastapi uvicorn ultralytics boto3 pillow python-multipart
```

### 1.5 — Upload Your Trained Model

Open a **new terminal** on your local machine:

```bash
# Create directory on EC2
ssh -i civicai-key.pem ec2-user@<EC2_IP> "mkdir -p /home/ec2-user/civicai/model"

# Copy trained model (run from civicai-frontend directory)
scp -i civicai-key.pem runs/detect/civicai-gpu/weights/best.pt ec2-user@<EC2_IP>:/home/ec2-user/civicai/model/best.pt
```

### 1.6 — Create the Prediction Server

Back in your **SSH terminal** on EC2:

```bash
cd /home/ec2-user/civicai
cat > predict_server.py << 'EOF'
"""
CivicAI YOLO Inference Server
FastAPI microservice for classifying civic infrastructure issues.

Endpoint: POST /predict
Input:  { "bucket": "civicai-images", "key": "complaints/uuid.jpg" }
Output: { "category": "pothole", "confidence": 0.92 }
"""

import io
import logging

import boto3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

# ── Configuration ────────────────────────────────────────────────────────────
MODEL_PATH = "model/best.pt"
REGION = "ap-south-1"

# ── Initialize ───────────────────────────────────────────────────────────────
app = FastAPI(title="CivicAI YOLO Inference", version="1.0")
model = YOLO(MODEL_PATH)
s3 = boto3.client("s3", region_name=REGION)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Class mapping (must match data.yaml order)
CLASS_NAMES = {0: "pothole", 1: "garbage", 2: "water", 3: "streetlight"}


class PredictRequest(BaseModel):
    bucket: str
    key: str


class PredictResponse(BaseModel):
    category: str
    confidence: float


@app.get("/health")
def health():
    return {"status": "healthy", "model": MODEL_PATH}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    logger.info(f"Inference request: bucket={req.bucket} key={req.key}")

    # Step 1 — Download image from S3
    try:
        response = s3.get_object(Bucket=req.bucket, Key=req.key)
        image_bytes = response["Body"].read()
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        logger.error(f"Failed to download from S3: {e}")
        raise HTTPException(status_code=400, detail=f"S3 download failed: {str(e)}")

    # Step 2 — Run YOLO inference
    try:
        results = model(image)
    except Exception as e:
        logger.error(f"YOLO inference failed: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

    # Step 3 — Extract top prediction
    if results and len(results[0].boxes) > 0:
        boxes = results[0].boxes
        top_idx = boxes.conf.argmax()
        class_id = int(boxes.cls[top_idx])
        confidence = float(boxes.conf[top_idx])
        category = CLASS_NAMES.get(class_id, "Unknown")
    else:
        category = "Unknown"
        confidence = 0.0
        logger.warning("No objects detected in image")

    logger.info(f"Result: category={category} confidence={confidence:.2f}")
    return PredictResponse(category=category, confidence=confidence)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF
```

### 1.7 — Test the Server

```bash
# Start server (foreground first to verify it works)
python3 predict_server.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Test from your **local machine**:
```bash
curl http://<EC2_IP>:8000/health
```

Expected: `{"status":"healthy","model":"model/best.pt"}`

### 1.8 — Run Server in Background (Keeps running after SSH disconnects)

```bash
# Stop the foreground server (Ctrl+C), then:
nohup python3 predict_server.py > yolo.log 2>&1 &

# Verify it's running
curl http://localhost:8000/health
```

> [!IMPORTANT]
> For production reliability, set up a systemd service:
> ```bash
> sudo tee /etc/systemd/system/civicai-yolo.service << EOF
> [Unit]
> Description=CivicAI YOLO Inference Server
> After=network.target
> 
> [Service]
> User=ec2-user
> WorkingDirectory=/home/ec2-user/civicai
> ExecStart=/usr/bin/python3 predict_server.py
> Restart=always
> 
> [Install]
> WantedBy=multi-user.target
> EOF
>
> sudo systemctl enable civicai-yolo
> sudo systemctl start civicai-yolo
> ```

---

## Step 2: Create S3 Bucket

1. Go to **S3** → **Create bucket**

   | Setting | Value |
   |---|---|
   | Bucket name | `civicai-images` |
   | Region | `ap-south-1` |
   | Block all public access | ✅ Keep enabled |

2. Click **Create bucket**

### 2.1 — Add CORS Configuration

1. Go to **civicai-images** → **Permissions** → **CORS configuration** → **Edit**
2. Paste:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT", "GET"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

3. Click **Save changes**

> [!IMPORTANT]
> Without CORS, the frontend cannot upload images to S3 via presigned URLs.

---

## Step 3: Create DynamoDB Table

1. Go to **DynamoDB** → **Create table**

   | Setting | Value |
   |---|---|
   | Table name | `Complaints` |
   | Partition key | `incident_id` (String) |
   | Sort key | Leave empty |
   | Capacity mode | **On-demand** |

2. Click **Create table**

---

## Step 4: Set Up SES Email

1. Go to **Amazon SES** → **Verified identities** → **Create identity**
2. Select **Email address** → enter your email (e.g., `you@gmail.com`)
3. Click **Create identity**
4. **Check your inbox** → click the verification link from AWS
5. **Note this email** — it becomes your `SES_SOURCE_EMAIL`

> [!WARNING]
> **Sandbox mode**: New SES accounts can only send to verified emails. For demo purposes this is fine. For production, request **Production Access** in SES dashboard.

---

## Step 5: Enable Amazon Bedrock (Claude)

1. Go to **Amazon Bedrock** → **Model access** (left sidebar)
2. Click **Manage model access**
3. Find **Anthropic** → check **Claude** (`anthropic.claude-v2`)
4. Click **Request model access** → wait for **Access granted**

> [!NOTE]
> If Bedrock is unavailable in `ap-south-1`, use `us-east-1` and update the `REGION` env var in Lambda 2.

---

## Step 6: Create IAM Roles

### Role A — `civicai-lambda-upload-role` (for Lambda 1)

1. **IAM** → **Roles** → **Create role** → AWS service → **Lambda** → Next
2. Attach: `AWSLambdaBasicExecutionRole` → Next
3. Name: `civicai-lambda-upload-role` → **Create role**
4. Click the role → **Add permissions** → **Create inline policy** → **JSON**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["s3:PutObject", "s3:GetObject"],
            "Resource": "arn:aws:s3:::civicai-images/*"
        }
    ]
}
```

5. Name: `civicai-s3-upload-policy` → **Create policy**

---

### Role B — `civicai-lambda-process-role` (for Lambda 2)

1. **IAM** → **Roles** → **Create role** → AWS service → **Lambda** → Next
2. Attach: `AWSLambdaBasicExecutionRole` → Next
3. Name: `civicai-lambda-process-role` → **Create role**
4. Click the role → **Add permissions** → **Create inline policy** → **JSON**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3Read",
            "Effect": "Allow",
            "Action": ["s3:GetObject"],
            "Resource": "arn:aws:s3:::civicai-images/*"
        },
        {
            "Sid": "DynamoDB",
            "Effect": "Allow",
            "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan"],
            "Resource": "arn:aws:dynamodb:ap-south-1:*:table/Complaints"
        },
        {
            "Sid": "SES",
            "Effect": "Allow",
            "Action": ["ses:SendEmail", "ses:SendRawEmail"],
            "Resource": "*"
        },
        {
            "Sid": "Bedrock",
            "Effect": "Allow",
            "Action": ["bedrock:InvokeModel"],
            "Resource": "arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-v2"
        }
    ]
}
```

5. Name: `civicai-process-policy` → **Create policy**

---

## Step 7: Create Lambda 1 — `generate_upload_url`

### 7.1 — Create Function

1. **Lambda** → **Create function**

   | Setting | Value |
   |---|---|
   | Function name | `civicai-generate-upload-url` |
   | Runtime | Python 3.12 |
   | Architecture | x86_64 |
   | Execution role | Use existing → `civicai-lambda-upload-role` |

2. Click **Create function**

### 7.2 — Upload Code

1. In the **Code** tab, replace the default `lambda_function.py` with the contents of:
   ```
   backend/generate_upload_url/lambda_function.py
   ```
2. Click **Deploy**

### 7.3 — Environment Variables

**Configuration** → **Environment variables** → **Edit** → Add:

| Key | Value |
|---|---|
| `BUCKET_NAME` | `civicai-images` |
| `REGION` | `ap-south-1` |
| `URL_EXPIRY` | `300` |

### 7.4 — General Configuration

**Configuration** → **General configuration** → **Edit**:
- Timeout: **15 seconds**
- Memory: **128 MB**

---

## Step 8: Create Lambda 2 — `process_image`

### 8.1 — Create Function

1. **Lambda** → **Create function**

   | Setting | Value |
   |---|---|
   | Function name | `civicai-process-image` |
   | Runtime | Python 3.12 |
   | Architecture | x86_64 |
   | Execution role | Use existing → `civicai-lambda-process-role` |

2. Click **Create function**

### 8.2 — Upload Code as ZIP

This Lambda has **7 files**. You must upload as a `.zip`:

1. On your PC, go to `backend/process_image/`
2. Select **ALL** these files:
   - `lambda_function.py`
   - `config.py`
   - `aws_utils.py`
   - `inference_client.py`
   - `severity_rules.py`
   - `department_mapper.py`
   - `prompt_builder.py`
3. Right-click → **Send to** → **Compressed (zipped) folder** → name: `process_image.zip`
4. In Lambda console → **Code** tab → **Upload from** → **.zip file** → upload it
5. Click **Deploy**

### 8.3 — Add `requests` Lambda Layer

The `inference_client.py` uses the `requests` library which isn't in the Lambda runtime.

1. In your Lambda function → scroll down → **Layers** → **Add a layer**
2. Choose **Specify an ARN** → paste:
   ```
   arn:aws:lambda:ap-south-1:770693421928:layer:Klayers-p312-requests:5
   ```
   *(Check [Klayers](https://github.com/keithrozario/Klayers) for the latest ARN)*
3. Click **Add**

### 8.4 — Environment Variables

**Configuration** → **Environment variables** → **Edit** → Add:

| Key | Value |
|---|---|
| `TABLE_NAME` | `Complaints` |
| `EC2_ENDPOINT` | `http://<EC2_IP>:8000/predict` |
| `MODEL_ID` | `anthropic.claude-v2` |
| `SES_SOURCE_EMAIL` | `your-verified-email@gmail.com` |
| `REGION` | `ap-south-1` |
| `BUCKET_NAME` | `civicai-images` |
| `YOLO_TIMEOUT` | `10` |

> [!CAUTION]
> Replace `<EC2_IP>` with your **Elastic IP** from Step 1.2. Replace the email with the one you verified in Step 4.

### 8.5 — General Configuration

**Configuration** → **General configuration** → **Edit**:
- Timeout: **60 seconds** (Bedrock can be slow)
- Memory: **256 MB**

### 8.6 — Add S3 Event Trigger

1. Go to **S3** → **civicai-images** → **Properties** tab
2. Scroll to **Event notifications** → **Create event notification**

   | Setting | Value |
   |---|---|
   | Event name | `complaint-image-uploaded` |
   | Prefix | `complaints/` |
   | Event types | ✅ `s3:ObjectCreated:Put` |
   | Destination | **Lambda function** |
   | Lambda function | `civicai-process-image` |

3. Click **Save changes**

---

## Step 9: Create API Gateway

### 9.1 — Create REST API

1. **API Gateway** → **Create API** → **REST API** → **Build**

   | Setting | Value |
   |---|---|
   | API name | `CivicAI-API` |
   | Endpoint type | Regional |

2. Click **Create API**

### 9.2 — Create Resource `/upload/presign`

1. Click **Create Resource** → Resource name: `upload` → ✅ Enable CORS → **Create**
2. Select `/upload` → **Create Resource** → Resource name: `presign` → ✅ Enable CORS → **Create**
3. Select `/upload/presign` → **Create Method**:
   - Method: **POST**
   - Integration type: **Lambda Function**
   - ✅ **Lambda Proxy Integration**
   - Lambda function: `civicai-generate-upload-url`
   - Click **Create Method**

### 9.3 — Enable CORS

1. Select `/upload/presign` → **Enable CORS**
2. Check: `POST`, `OPTIONS`
3. Access-Control-Allow-Origin: `*`
4. Access-Control-Allow-Headers: `Content-Type,Authorization`
5. Click **Save**

### 9.4 — Deploy API

1. Click **Deploy API**
2. Stage: **New Stage** → name: `prod`
3. Click **Deploy**
4. **Copy the Invoke URL**:
   ```
   https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod
   ```

---

## Step 10: Connect Frontend

### 10.1 — Update `.env`

Edit `civicai-frontend/.env`:

```env
VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod
```

Replace `xxxxxxxxxx` with your actual API Gateway ID from Step 9.4.

### 10.2 — Test Locally

```bash
npm run dev
```

Open `http://localhost:5173` — the React app now calls your real AWS backend.

---

## Step 11: End-to-End Testing

### Test 1 — Health Check (EC2)

```bash
curl http://<EC2_IP>:8000/health
# Expected: {"status":"healthy","model":"model/best.pt"}
```

### Test 2 — Presigned URL (API Gateway → Lambda 1)

```bash
curl -X POST https://<API_URL>/prod/upload/presign \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.jpg", "fileType": "image/jpeg"}'
```

Expected:
```json
{
    "incident_id": "uuid-string",
    "upload_url": "https://civicai-images.s3.amazonaws.com/...",
    "s3_key": "complaints/uuid-string.jpg"
}
```

### Test 3 — Upload Image & Check Pipeline

```bash
# Upload a test image using the presigned URL from Test 2
curl -X PUT "<upload_url>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test-pothole.jpg
```

Then verify:
1. **CloudWatch** → Log groups → `/aws/lambda/civicai-process-image` → check logs
2. **DynamoDB** → `Complaints` table → **Explore items** → record should appear
3. **Email inbox** → notification email should arrive

### Test 4 — Full Browser Flow

1. Open `http://localhost:5173`
2. Login → Go to **Report an Issue**
3. Upload a pothole/garbage/streetlight photo
4. Click **Analyze with AI** → see YOLO classification
5. Submit complaint → verify in DynamoDB + email

---

## Quick Reference — All Environment Variables

| Service | Variable | Value |
|---|---|---|
| Lambda 1 | `BUCKET_NAME` | `civicai-images` |
| Lambda 1 | `REGION` | `ap-south-1` |
| Lambda 1 | `URL_EXPIRY` | `300` |
| Lambda 2 | `TABLE_NAME` | `Complaints` |
| Lambda 2 | `BUCKET_NAME` | `civicai-images` |
| Lambda 2 | `EC2_ENDPOINT` | `http://<ELASTIC_IP>:8000/predict` |
| Lambda 2 | `MODEL_ID` | `anthropic.claude-haiku-4-5-v1` |
| Lambda 2 | `SES_SOURCE_EMAIL` | `your-verified@gmail.com` |
| Lambda 2 | `REGION` | `ap-south-1` |
| Lambda 2 | `YOLO_TIMEOUT` | `10` |
| Frontend | `VITE_API_BASE_URL` | `https://xxx.execute-api.ap-south-1.amazonaws.com/prod` |

---

## Estimated Monthly Cost

| Service | Cost |
|---|---|
| EC2 `t3.medium` | ~$30/month (stop when not testing!) |
| Lambda | Free tier (1M requests/month) |
| S3 | ~$0.02/GB |
| DynamoDB | Free tier (25 GB) |
| API Gateway | Free tier (1M calls/month) |
| SES | $0.10 per 1000 emails |
| Bedrock Haiku 4.5 | ~$0.001 per 1K tokens |
| CloudFront | Free tier (1 TB/month) |
| **Total** | **~$30-35/month** (mostly EC2) |

> [!TIP]
> **Stop EC2 when not testing** — this cuts your bill to near-zero for a prototype.

---

## 12. Deploy Frontend (S3 + CloudFront)

Host the React frontend on S3 with CloudFront CDN for HTTPS and fast global loading.

### Step 1 — Build the Frontend

On your local machine:

```bash
cd civicai-frontend
npm run build
```

This creates a `dist/` folder with the production bundle.

### Step 2 — Create S3 Hosting Bucket

1. Go to **S3** → **Create bucket**
2. Configure:

   | Setting | Value |
   |---|---|
   | Bucket name | `civicai-frontend-hosting` |
   | Region | `ap-south-1` |
   | Block all public access | ❌ **Uncheck** "Block all public access" |
   | Acknowledge | ✅ Check the warning acknowledgment |

3. Click **Create bucket**
4. Go to **civicai-frontend-hosting** → **Properties** tab
5. Scroll to **Static website hosting** → **Edit** → **Enable**
   - Index document: `index.html`
   - Error document: `index.html` (for React Router)
6. Click **Save changes**

### Step 3 — Bucket Policy (Public Read)

1. Go to **Permissions** tab → **Bucket policy** → **Edit**
2. Paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::civicai-frontend-hosting/*"
        }
    ]
}
```

3. Click **Save changes**

### Step 4 — Upload Build Files

1. Go to **civicai-frontend-hosting** → **Objects** tab → **Upload**
2. Click **Add files** and **Add folder**
3. Upload **all contents** of the `dist/` folder (not the folder itself)
4. Click **Upload**

> [!TIP]
> Or use the AWS CLI: `aws s3 sync dist/ s3://civicai-frontend-hosting --delete`

### Step 5 — Create CloudFront Distribution

1. Go to **CloudFront** → **Create distribution**
2. Configure:

   | Setting | Value |
   |---|---|
   | Origin domain | Select `civicai-frontend-hosting.s3.ap-south-1.amazonaws.com` |
   | Origin access | Public |
   | Viewer protocol policy | **Redirect HTTP to HTTPS** |
   | Cache policy | `CachingOptimized` |
   | Default root object | `index.html` |

3. Click **Create distribution** (takes ~5 minutes to deploy)

### Step 6 — Fix React Router (Custom Error Page)

CloudFront needs to return `index.html` for all routes (React handles routing client-side):

1. Go to your distribution → **Error pages** tab → **Create custom error response**
2. Add:

   | Setting | Value |
   |---|---|
   | HTTP error code | `403` |
   | Customize error response | Yes |
   | Response page path | `/index.html` |
   | HTTP response code | `200` |

3. Repeat for error code `404` with the same settings

### Your Frontend URL

Once deployed, your site is live at:
```
https://<distribution-id>.cloudfront.net
```

Find this under **CloudFront** → your distribution → **Distribution domain name**.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Can't SSH into EC2 | Check security group has port 22 open to your IP |
| YOLO server unreachable | Check security group has port 8000 open, and server is running |
| Lambda timeout | Increase Lambda timeout; check EC2 is running |
| CORS errors in browser | Verify S3 CORS config and API Gateway CORS enabled |
| No email received | Check SES verification; sandbox only sends to verified emails |
| Bedrock access denied | Ensure model access is granted in Bedrock console |
| DynamoDB write fails | Check IAM role has `dynamodb:PutItem` permission |
