"""
lambda_function.py — Generate presigned S3 upload URL for JanSevaAI.

Returns a presigned PUT URL that the frontend uses to upload images
directly to S3, bypassing the Lambda / API Gateway payload limit.

API Gateway route: POST /upload/presign

Request body:
    {
        "fileName": "pothole.jpg",
        "fileType": "image/jpeg"
    }

Response:
    {
        "incident_id": "uuid",
        "upload_url": "signed_s3_url",
        "s3_key": "complaints/uuid.jpg"
    }
"""

import json
import logging
import os
import uuid

import boto3

# ── Configuration ────────────────────────────────────────────────────────────
REGION = os.environ.get("REGION", "ap-south-1")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "JanSevaAI-images")
URL_EXPIRY = int(os.environ.get("URL_EXPIRY", "300"))  # 5 minutes

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client("s3", region_name=REGION)


# ── CORS Headers ─────────────────────────────────────────────────────────────
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


def lambda_handler(event, context):
    """
    AWS Lambda entry point — generates a presigned S3 PUT URL.

    Workflow:
        1. Generate UUID-based incident_id
        2. Build S3 key: complaints/{incident_id}.jpg
        3. Generate presigned PUT URL (expires in 300s)
        4. Return { incident_id, upload_url, s3_key }

    Args:
        event:   API Gateway proxy event.
        context: Lambda runtime context.

    Returns:
        API Gateway proxy response with presigned URL.
    """
    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": "",
        }

    try:
        body = json.loads(event.get("body", "{}"))
    except (json.JSONDecodeError, TypeError):
        return _error_response(400, "Invalid JSON body")

    file_type = body.get("fileType", "image/jpeg")
    image_index = int(body.get("imageIndex", 1))

    # reuse an existing incident_id if provided (for multi-image uploads)
    incident_id = body.get("incidentId") or str(uuid.uuid4())

    extension = _get_extension(file_type)
    s3_key = f"complaints/{incident_id}_{image_index}{extension}"

    logger.info(
        "Generating presigned URL — bucket=%s key=%s type=%s",
        BUCKET_NAME, s3_key, file_type,
    )

    try:
        upload_url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": s3_key,
                "ContentType": file_type,
            },
            ExpiresIn=URL_EXPIRY,
        )
    except Exception as exc:
        logger.error("Failed to generate presigned URL: %s", str(exc))
        return _error_response(500, "Could not generate upload URL")

    result = {
        "incident_id": incident_id,
        "upload_url": upload_url,
        "s3_key": s3_key,
    }

    logger.info("Presigned URL generated for %s", incident_id)

    return {
        "statusCode": 200,
        "headers": {
            **CORS_HEADERS,
            "Content-Type": "application/json",
        },
        "body": json.dumps(result),
    }


def _get_extension(file_type: str) -> str:
    """Extract file extension directly from MIME type (e.g., 'image/png' -> '.png')."""
    if file_type and "/" in file_type:
        ext = file_type.split("/")[-1].lower()
        # map jpeg to .jpg, otherwise use the suffix
        if ext == "jpeg":
            return ".jpg"
        # strip any extra parameters (like ;charset=...)
        ext = ext.split(";")[0]
        return f".{ext}"
    return ".jpg"


def _error_response(status_code: int, message: str) -> dict:
    """Return a formatted error response."""
    return {
        "statusCode": status_code,
        "headers": {
            **CORS_HEADERS,
            "Content-Type": "application/json",
        },
        "body": json.dumps({"error": message}),
    }
