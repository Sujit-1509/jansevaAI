# CivicAI: AWS Frontend Hosting & Final API Setup Guide

This guide covers the final steps to make your CivicAI application accessible on the public internet and connect the new features (OTP Auth, Any-Format Uploads, User Descriptions).

## Part 1: Deploy New Lambdas

### 1. `civicai-auth` (Real OTP via SNS)
1. Go to **AWS Lambda** → **Create function**.
2. Name it `civicai-auth`, choose Python 3.12, and create.
3. Paste the contents of `backend/auth/lambda_function.py`.
4. Go to **Configuration** → **Permissions** → Click the Execution Role.
5. In IAM, click **Add permissions** → **Attach policies**.
6. Attach `AmazonDynamoDBFullAccess` and `AmazonSNSFullAccess`.
7. Back in Lambda, go to **Configuration** → **Environment variables**.
8. Add `REGION` (`ap-south-1`) and `TABLE_NAME` (`Users`).
9. **Deploy**.

> **Important**: You must create a new DynamoDB table called `Users` with the Partition Key `phone` (String).

> **SNS Sandbox Reminder**: Go to the **Amazon SNS Console** → **Mobile** → **Text messaging (SMS)**. 
> Under **Sandbox destination phone numbers**, click **Add phone number**. Add your own mobile number and verify it. AWS will **only** send OTPs to verified numbers until you request production access.

### 2. `civicai-submit-complaint` (Finalizing Submissions)
1. Create another Lambda named `civicai-submit-complaint`.
2. Paste the contents of `backend/submit_complaint/lambda_function.py`.
3. Give its IAM Role `AmazonDynamoDBFullAccess`.
4. Add Environment Variable `TABLE_NAME` (`Complaints`).
5. **Deploy**.

---

## Part 2: Update API Gateway

Go to **API Gateway** → your `CivicAI-API`.

### 1. Auth Endpoints
1. Click **Create Resource** → Path: `auth`.
2. Under `/auth`, create Resource `send-otp`. Create a **POST** method under it.
   - Integration Type: **Lambda Function**
   - Use Lambda Proxy integration: **Checked**
   - Function: `civicai-auth`
3. Under `/auth`, create Resource `verify-otp`. Create a **POST** method under it.
   - Integration Type: **Lambda Function**
   - Use Lambda Proxy integration: **Checked**
   - Function: `civicai-auth`

### 2. Final Submit Endpoint
1. Under your existing `/complaints` resource (or create it), create a **POST** method.
   - Integration Type: **Lambda Function**
   - Use Lambda Proxy integration: **Checked**
   - Function: `civicai-submit-complaint`

### 3. Deploy API
1. For all new endpoints, click **Enable CORS** to allow frontend access.
2. Click **Deploy API** → Stage: `prod`.

---

## Part 3: Host Frontend on S3 & CloudFront

### 1. Build the App
Open your terminal inside `civicai-frontend` and run:
```bash
npm run build
```
This creates a `dist` folder containing your production-ready files.

### 2. Create S3 Bucket For Hosting
1. Go to **S3** → **Create bucket**.
2. Name it (e.g., `civicai-frontend-prod-domain`).
3. **Block Public Access settings**: Keep this **checked** (CloudFront will bypass it securely).
4. Create bucket.

### 3. Upload Files
1. Open the bucket and click **Upload**.
2. Upload all the files and folders **INSIDE** the `dist` folder (do NOT upload the `dist` folder itself, upload its contents).

### 4. Setup CloudFront (CDN & HTTPS)
1. Go to **CloudFront** → **Create Distribution**.
2. **Origin domain**: Select your new S3 bucket from the dropdown.
3. Under **Origin access**, select **Origin access control settings (recommended)**.
   - Click **Create new OAC** and save.
4. **Viewer protocol policy**: Select **Redirect HTTP to HTTPS**.
5. **Default root object**: Type `index.html`.
6. Click **Create Distribution**.

### 5. Finalize CloudFront & S3 Permissions
1. On the CloudFront distribution success page, click **Copy policy**.
2. Go back to your **S3 Bucket** → **Permissions** tab.
3. Edit **Bucket Policy** and paste the policy you copied. Save it.
4. Go back to your CloudFront distribution → **Error pages** tab.
5. Create a **Custom error response**:
   - HTTP error code: `404: Not Found`
   - Customize error response: **Yes**
   - Response page path: `/index.html`
   - HTTP Response Code: `200: OK`
   *(This ensures React Router works correctly when refreshing pages).*

### Your App is Live!
Wait ~5 minutes for CloudFront to deploy. Your app is now live at the CloudFront **Distribution domain name** (e.g., `d1234abcd.cloudfront.net`).
