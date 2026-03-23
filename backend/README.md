# JanSevaAI — Backend Lambda Functions

This directory contains the AWS Lambda function source code for the JanSevaAI platform.

## Lambda Functions

| Function | Route | Description |
|----------|-------|-------------|
| `auth/` | `POST /auth/send-otp`, `POST /auth/verify-otp` | OTP-based phone authentication via AWS SNS |
| `generate_upload_url/` | `POST /upload/presign` | Generates presigned S3 PUT URLs for direct image upload |
| `process_image/` | *(S3 trigger)* | AI pipeline — YOLO inference → severity → Bedrock description → DynamoDB |
| `submit_complaint/` | `POST /complaints` | Finalizes complaint submission with user notes/GPS |
| `get_user_complaints/` | `GET /complaints` | Lists complaints, with multi-role filtering support |
| `get_complaint/` | `GET /complaints/{id}` | Retrieves a single complaint by `incident_id` |
| `update_complaint_status/` | `PATCH /complaints/{id}/status` | Updates status + audit log + GPS resolve stamp |
| `bulk_update/` | `POST /complaints/bulk` | Administrative tool for batch status/assignment updates |
| `upvote_complaint/` | `POST /complaints/{id}/upvote` | Increments upvote count and dynamic priority score |
| `get_nearby_complaints/` | `GET /complaints/nearby` | Haversine distance-based spatial filtering |
| `assign_complaint/` | `POST /complaints/{id}/assign` | Explicit assignment to field workers with notes |
| `delete_complaint/` | `DELETE /complaints/{id}` | Administrative removal of incident records |
| `manage_workers/` | `ANY /api/workers` | Full CRUD management for the worker registry |

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
