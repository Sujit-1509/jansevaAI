# CivicAI — AWS Console Setup Guide

Complete step-by-step instructions to deploy CivicAI on AWS. Follow each section **in order** — later services depend on earlier ones.

> **Region**: Use **`ap-south-1`** (Mumbai) throughout. All services must be in the same region.

---

## Table of Contents

1. [S3 Bucket](#1-s3-bucket)
2. [DynamoDB Table](#2-dynamodb-table)
3. [SES Email](#3-ses-email)
4. [IAM Roles](#4-iam-roles)
5. [EC2 — YOLO Inference Server](#5-ec2--yolo-inference-server)
6. [Amazon Bedrock — Enable Claude](#6-amazon-bedrock--enable-claude)
7. [Lambda 1 — generate_upload_url](#7-lambda-1--generate_upload_url)
8. [Lambda 2 — process_image](#8-lambda-2--process_image)
9. [API Gateway](#9-api-gateway)
10. [Connect Frontend](#10-connect-frontend)
11. [Testing](#11-testing-the-full-pipeline)

---

## 1. S3 Bucket

This bucket stores uploaded complaint images.

### Steps

1. Go to **S3** → **Create bucket**
2. Configure:

   | Setting | Value |
   |---|---|
   | Bucket name | `civicai-images` |
   | Region | `ap-south-1` |
   | Object Ownership | ACLs disabled |
   | Block all public access | ✅ Enabled (keep all 4 checkboxes checked) |
   | Versioning | Disabled |

3. Click **Create bucket**

### CORS Configuration

After creating the bucket:

1. Go to **civicai-images** → **Permissions** tab → **CORS configuration** → **Edit**
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
> The CORS config is **required** — without it, the frontend cannot upload images directly to S3 via presigned URLs.

### S3 Event Trigger (do this AFTER creating Lambda 2)

We will come back to add the S3 → Lambda trigger in [Step 8](#s3-event-trigger-configuration).

---

## 2. DynamoDB Table

Stores all complaint records.

### Steps

1. Go to **DynamoDB** → **Create table**
2. Configure:

   | Setting | Value |
   |---|---|
   | Table name | `Complaints` |
   | Partition key | `incident_id` (String) |
   | Sort key | Leave empty |
   | Table settings | Default settings |
   | Capacity mode | **On-demand** |

3. Click **Create table**

### Schema Reference

The table will store these attributes (created automatically on first write):

| Attribute | Type | Description |
|---|---|---|
| `incident_id` | String | UUID primary key |
| `category` | String | pothole, garbage, water, streetlight |
| `confidence` | String | YOLO confidence (stored as string) |
| `severity` | String | High, Medium, Low, Pending Review |
| `department` | String | Mapped department name |
| `description` | String | Bedrock-generated complaint text |
| `status` | String | Pending, In Progress, Resolved |
| `timestamp` | String | ISO 8601 timestamp |
| `s3_key` | String | S3 object key |
| `latitude` | String | GPS latitude (optional) |
| `longitude` | String | GPS longitude (optional) |

---

## 3. SES Email

Sends email notifications when complaints are processed.

### Steps

1. Go to **Amazon SES** → **Verified identities** → **Create identity**
2. Select **Email address**
3. Enter your email (e.g., `your-email@gmail.com`)
4. Click **Create identity**
5. **Check your inbox** — click the verification link in the email from AWS

> [!WARNING]
> **SES Sandbox Mode**: New accounts are in sandbox mode. You can only send to verified emails. For production, request **Production Access** under SES → Account dashboard → Request production access.

### Note the email

You will use this verified email as `SES_SOURCE_EMAIL` environment variable in Lambda 2.

---

## 4. IAM Roles

You need **two IAM roles** — one for each Lambda function.

### Role 1: `civicai-lambda-upload-role`

For the `generate_upload_url` Lambda.

1. Go to **IAM** → **Roles** → **Create role**
2. Trusted entity: **AWS service** → **Lambda**
3. Click **Next**
4. Attach these policies:
   - `AWSLambdaBasicExecutionRole` (search and check it)
5. Click **Next** → Name: `civicai-lambda-upload-role` → **Create role**
6. **After creation**, click the role → **Add permissions** → **Create inline policy**
7. Switch to **JSON** tab and paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::civicai-images/*"
        }
    ]
}
```

8. Name: `civicai-s3-upload-policy` → **Create policy**

---

### Role 2: `civicai-lambda-process-role`

For the `process_image` Lambda.

1. Go to **IAM** → **Roles** → **Create role**
2. Trusted entity: **AWS service** → **Lambda**
3. Attach: `AWSLambdaBasicExecutionRole`
4. Click **Next** → Name: `civicai-lambda-process-role` → **Create role**
5. Click the role → **Add permissions** → **Create inline policy** → **JSON**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3Read",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::civicai-images/*"
        },
        {
            "Sid": "DynamoDB",
            "Effect": "Allow",
            "Action": [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:Scan"
            ],
            "Resource": "arn:aws:dynamodb:ap-south-1:*:table/Complaints"
        },
        {
            "Sid": "SES",
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        },
        {
            "Sid": "Bedrock",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": "arn:aws:bedrock:ap-south-1::foundation-model/anthropic.claude-v2"
        }
    ]
}
```

6. Name: `civicai-process-policy` → **Create policy**

---

## 5. EC2 — YOLO Inference Server

Hosts the FastAPI YOLO microservice that classifies images.

### Launch Instance

1. Go to **EC2** → **Launch instance**
2. Configure:

   | Setting | Value |
   |---|---|
   | Name | `civicai-yolo-server` |
   | AMI | Amazon Linux 2023 or Ubuntu 22.04 |
   | Instance type | `t3.medium` (minimum for YOLO) |
   | Key pair | Create new or use existing |

3. **Network settings** → Create a security group:

   | Type | Port | Source | Description |
   |---|---|---|---|
   | SSH | 22 | My IP | SSH access |
   | Custom TCP | 8000 | 0.0.0.0/0 | YOLO FastAPI endpoint |

4. Storage: 20 GB gp3
5. Click **Launch instance**

### Setup YOLO Server (SSH into the instance)

```bash
# Connect via SSH
ssh -i your-key.pem ec2-user@<PUBLIC_IP>

# Install Python and dependencies
sudo yum update -y          # Amazon Linux
sudo yum install python3 python3-pip -y

# Install packages
pip3 install fastapi uvicorn ultralytics boto3 pillow

# Create the FastAPI app (create predict_server.py)
# Your YOLO model should expose POST /predict
# Input:  { "bucket": "civicai-images", "key": "complaints/uuid.jpg" }
# Output: { "category": "pothole", "confidence": 0.92 }

# Run the server
uvicorn predict_server:app --host 0.0.0.0 --port 8000
```

### Note the endpoint

Your YOLO endpoint will be:
```
http://<EC2_PUBLIC_IP>:8000/predict
```

You'll use this as the `EC2_ENDPOINT` env var in Lambda 2.

> [!TIP]
> For production, use an Elastic IP so the address doesn't change on restart. Go to **EC2** → **Elastic IPs** → **Allocate** → **Associate** with your instance.

---

## 6. Amazon Bedrock — Enable Claude

Used to generate formal complaint text.

### Steps

1. Go to **Amazon Bedrock** → **Model access** (left sidebar)
2. Click **Manage model access**
3. Find **Anthropic** → Check **Claude** (specifically `anthropic.claude-v2`)
4. Click **Request model access**
5. Wait for status to change to **Access granted** (usually instant)

> [!IMPORTANT]
> If Bedrock is not available in `ap-south-1`, use `us-east-1` and update the `REGION` env var in Lambda 2 accordingly. Check [Bedrock region availability](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html).

---

## 7. Lambda 1 — generate_upload_url

Generates presigned S3 upload URLs for the frontend.

### Create Function

1. Go to **Lambda** → **Create function**
2. Configure:

   | Setting | Value |
   |---|---|
   | Function name | `civicai-generate-upload-url` |
   | Runtime | Python 3.12 |
   | Architecture | x86_64 |
   | Execution role | **Use existing role** → `civicai-lambda-upload-role` |

3. Click **Create function**

### Upload Code

1. In the **Code** tab, delete the default `lambda_function.py`
2. Copy-paste the contents of your local file:
   ```
   backend/generate_upload_url/lambda_function.py
   ```
3. Click **Deploy**

### Environment Variables

1. Go to **Configuration** → **Environment variables** → **Edit**
2. Add:

   | Key | Value |
   |---|---|
   | `BUCKET_NAME` | `civicai-images` |
   | `REGION` | `ap-south-1` |
   | `URL_EXPIRY` | `300` |

3. Click **Save**

### General Configuration

1. Go to **Configuration** → **General configuration** → **Edit**
2. Set:
   - Timeout: **15 seconds**
   - Memory: **128 MB**
3. Click **Save**

---

## 8. Lambda 2 — process_image

Processes uploaded images: YOLO → severity → department → Bedrock → DynamoDB → SES.

### Create Function

1. Go to **Lambda** → **Create function**
2. Configure:

   | Setting | Value |
   |---|---|
   | Function name | `civicai-process-image` |
   | Runtime | Python 3.12 |
   | Architecture | x86_64 |
   | Execution role | **Use existing role** → `civicai-lambda-process-role` |

3. Click **Create function**

### Upload Code

This Lambda has **multiple files**. You must upload as a ZIP:

1. On your local machine, navigate to `backend/process_image/`
2. Select ALL files:
   - `lambda_function.py`
   - `config.py`
   - `aws_utils.py`
   - `inference_client.py`
   - `severity_rules.py`
   - `department_mapper.py`
   - `prompt_builder.py`
3. Right-click → **Send to** → **Compressed (zipped) folder** → name it `process_image.zip`
4. In Lambda console → **Code** tab → **Upload from** → **.zip file** → upload `process_image.zip`
5. Click **Deploy**

### Add `requests` Layer

The `process_image` Lambda uses the `requests` library (not included in Lambda runtime).

**Option A — Use a public Lambda Layer:**

1. Go to **Layers** → **Add a layer**
2. Choose **Specify an ARN**
3. Paste (for `ap-south-1`, Python 3.12):
   ```
   arn:aws:lambda:ap-south-1:770693421928:layer:Klayers-p312-requests:5
   ```
   (Check [Klayers](https://github.com/keithrozario/Klayers) for latest ARN)
4. Click **Add**

**Option B — Create your own layer:**

```bash
mkdir python
pip install requests -t python/
zip -r requests-layer.zip python/
```
Upload as a Lambda Layer, then attach it to your function.

### Environment Variables

1. Go to **Configuration** → **Environment variables** → **Edit**
2. Add:

   | Key | Value |
   |---|---|
   | `TABLE_NAME` | `Complaints` |
   | `EC2_ENDPOINT` | `http://<EC2_PUBLIC_IP>:8000/predict` |
   | `MODEL_ID` | `anthropic.claude-v2` |
   | `SES_SOURCE_EMAIL` | `your-verified-email@gmail.com` |
   | `REGION` | `ap-south-1` |
   | `BUCKET_NAME` | `civicai-images` |
   | `YOLO_TIMEOUT` | `10` |

3. Click **Save**

### General Configuration

1. **Configuration** → **General configuration** → **Edit**
2. Set:
   - Timeout: **60 seconds** (Bedrock can be slow)
   - Memory: **256 MB**
3. Click **Save**

### S3 Event Trigger Configuration

Now go back to S3 and connect it:

1. Go to **S3** → **civicai-images** → **Properties** tab
2. Scroll to **Event notifications** → **Create event notification**
3. Configure:

   | Setting | Value |
   |---|---|
   | Event name | `complaint-image-uploaded` |
   | Prefix | `complaints/` |
   | Event types | ✅ `s3:ObjectCreated:Put` |
   | Destination | **Lambda function** |
   | Lambda function | `civicai-process-image` |

4. Click **Save changes**

> [!IMPORTANT]
> This trigger means: whenever an image is uploaded to `complaints/` in S3, the `process_image` Lambda fires automatically. No API call needed.

---

## 9. API Gateway

Creates the REST API that the frontend calls.

### Create API

1. Go to **API Gateway** → **Create API**
2. Choose **REST API** (not HTTP API) → **Build**
3. Configure:

   | Setting | Value |
   |---|---|
   | API name | `CivicAI-API` |
   | Endpoint type | **Regional** |

4. Click **Create API**

### Create Resources and Methods

You need these routes:

```
POST /upload/presign    → civicai-generate-upload-url Lambda
```

#### Step-by-step for `/upload/presign`:

1. Click **Create Resource**
   - Resource name: `upload`
   - Resource path: `/upload`
   - ✅ Enable CORS
   - Click **Create Resource**

2. Select `/upload` → **Create Resource** again
   - Resource name: `presign`
   - Resource path: `/presign`
   - ✅ Enable CORS
   - Click **Create Resource**

3. Select `/upload/presign` → **Create Method**
   - Method type: **POST**
   - Integration type: **Lambda Function**
   - ✅ Lambda Proxy Integration
   - Lambda function: `civicai-generate-upload-url`
   - Click **Create Method**

#### Enable CORS on the resource:

1. Select `/upload/presign` resource
2. Click **Enable CORS**
3. Check: `POST`, `OPTIONS`
4. Access-Control-Allow-Origin: `*`
5. Access-Control-Allow-Headers: `Content-Type,Authorization`
6. Click **Save**

### Deploy API

1. Click **Deploy API**
2. Stage: **New Stage** → Stage name: `prod`
3. Click **Deploy**

### Copy the Invoke URL

After deployment, you'll see:

```
Invoke URL: https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod
```

**Copy this URL** — you need it for the frontend.

---

## 10. Connect Frontend

### Update `.env`

Open `civicai-frontend/.env` and set:

```env
VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/prod
```

Replace `xxxxxxxxxx` with your actual API Gateway ID.

### Start the app

```bash
npm run dev
```

The frontend will now make real API calls to your AWS backend.

---

## 11. Testing the Full Pipeline

### Test 1: Presigned URL

```bash
curl -X POST https://YOUR_API_URL/prod/upload/presign \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.jpg", "fileType": "image/jpeg"}'
```

**Expected response:**
```json
{
    "incident_id": "uuid-string",
    "upload_url": "https://civicai-images.s3.amazonaws.com/...",
    "s3_key": "complaints/uuid-string.jpg"
}
```

### Test 2: Upload Image to S3

```bash
curl -X PUT "<upload_url_from_step_1>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test-image.jpg
```

### Test 3: Check S3 Trigger

1. Go to **CloudWatch** → **Log groups** → `/aws/lambda/civicai-process-image`
2. Check the latest log stream — you should see processing logs
3. Go to **DynamoDB** → **Complaints** table → **Explore items** — the record should appear

### Test 4: End-to-End in Browser

1. Open `http://localhost:5173`
2. Login with any phone number + OTP `123456`
3. Go to **Report an Issue** → Upload a photo
4. Click **Analyze with AI** → should trigger real YOLO analysis
5. Review and **Submit Complaint**
6. Verify in DynamoDB and your email inbox

---

## Quick Reference — All Environment Variables

| Lambda | Variable | Example Value |
|---|---|---|
| Lambda 1 | `BUCKET_NAME` | `civicai-images` |
| Lambda 1 | `REGION` | `ap-south-1` |
| Lambda 1 | `URL_EXPIRY` | `300` |
| Lambda 2 | `TABLE_NAME` | `Complaints` |
| Lambda 2 | `BUCKET_NAME` | `civicai-images` |
| Lambda 2 | `EC2_ENDPOINT` | `http://1.2.3.4:8000/predict` |
| Lambda 2 | `MODEL_ID` | `anthropic.claude-v2` |
| Lambda 2 | `SES_SOURCE_EMAIL` | `your-email@gmail.com` |
| Lambda 2 | `REGION` | `ap-south-1` |
| Lambda 2 | `YOLO_TIMEOUT` | `10` |
| Frontend | `VITE_API_BASE_URL` | `https://xxx.execute-api.ap-south-1.amazonaws.com/prod` |

---

## Estimated AWS Cost (Prototype)

| Service | Estimated Cost |
|---|---|
| Lambda | Free tier (1M requests/month) |
| S3 | ~$0.02/GB stored |
| DynamoDB | Free tier (25 GB + 25 WCU/RCU) |
| API Gateway | Free tier (1M calls/month) |
| SES | $0.10 per 1000 emails |
| EC2 `t3.medium` | ~$0.042/hr (~$30/month if always on) |
| Bedrock Claude v2 | ~$0.008 per 1K input tokens |

> [!TIP]
> **Total prototype cost**: Under **$35/month**, mostly from EC2. Stop the EC2 instance when not testing to save costs.
