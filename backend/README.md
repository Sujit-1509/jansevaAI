# CivicAI — Backend Lambda Functions

This directory contains the AWS Lambda function source code for the CivicAI platform.

## Lambda Functions

| Function | Route | Description |
|----------|-------|-------------|
| `auth/` | `POST /auth/send-otp`, `POST /auth/verify-otp` | OTP-based phone authentication via AWS SNS |
| `generate_upload_url/` | `POST /upload/presign` | Generates presigned S3 PUT URLs for direct image upload |
| `process_image/` | *(S3 trigger)* | AI pipeline — YOLO inference → severity → Bedrock description → DynamoDB |
| `submit_complaint/` | `POST /complaints` | Finalizes complaint with user notes, GPS, and sets status to "Submitted" |
| `get_user_complaints/` | `GET /complaints` | Lists complaints, optionally filtered by `phone` query parameter |
| `get_complaint/` | `GET /complaints/{id}` | Retrieves a single complaint by `incident_id` |

## Environment Variables

All Lambdas use:
- `REGION` — AWS region (default: `ap-south-1`)
- `TABLE_NAME` — DynamoDB table name (default: `Complaints`)

Additional per-function:
- **auth**: `JWT_SECRET` — signing key for token generation
- **generate_upload_url**: `BUCKET_NAME`, `URL_EXPIRY`
- **process_image**: `EC2_ENDPOINT`, `SES_SOURCE_EMAIL`, `YOLO_TIMEOUT`

## Deployment

Each function is deployed as a separate AWS Lambda. See [docs/aws_lambda_gateway_setup.md](../docs/aws_lambda_gateway_setup.md) for full setup instructions.
