"""
lambda_function.py — Citizen Feedback Sentiment Analysis Lambda for JanSevaAI.

Endpoint: POST /complaints/{id}/feedback

Accepts citizen feedback text after complaint resolution, runs VADER
sentiment analysis, stores the result in the Complaints DynamoDB table,
and returns the sentiment classification.

Follows the same JWT auth + CORS pattern as all other JanSevaAI Lambdas.
"""

import json
import logging
import os
import time
import base64
import hmac
import hashlib
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

from sentiment import analyze_sentiment

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Configuration ────────────────────────────────────────────────────────────
REGION = os.environ.get("REGION", "ap-south-1")
TABLE_NAME = os.environ.get("TABLE_NAME", "Complaints")
SECRET_KEY = os.environ.get(
    "JWT_SECRET", "JanSevaAI-fallback-secret-key-12345"
).encode("utf-8")

dynamodb = boto3.resource("dynamodb", region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


# ── JWT verification (same pattern as all other Lambdas) ─────────────────────
def verify_token(event):
    """Verify the JWT token locally using HMAC SHA-256."""
    auth = (event.get("headers") or {}).get("Authorization") or (
        event.get("headers") or {}
    ).get("authorization", "")
    token = auth.replace("Bearer ", "").strip()
    if not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, sig = parts
        expected = (
            base64.urlsafe_b64encode(
                hmac.new(
                    SECRET_KEY,
                    f"{header}.{payload}".encode(),
                    hashlib.sha256,
                ).digest()
            )
            .decode()
            .rstrip("=")
        )
        if not hmac.compare_digest(sig, expected):
            return None
        pad = 4 - len(payload) % 4
        if pad != 4:
            payload += "=" * pad
        decoded = json.loads(base64.urlsafe_b64decode(payload))
        if decoded.get("exp", 0) < int(time.time()):
            return None
        return decoded
    except Exception:
        return None


# ── Helper: convert floats to Decimal for DynamoDB ───────────────────────────
def _to_decimal(obj):
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(i) for i in obj]
    return obj


# ── Main handler ─────────────────────────────────────────────────────────────
def lambda_handler(event, context):
    method = event.get("httpMethod", "") or (
        event.get("requestContext", {}).get("http", {}).get("method", "")
    )

    # CORS preflight
    if method == "OPTIONS":
        return _response(200, "")

    # ── Auth ─────────────────────────────────────────────────────────────────
    user = verify_token(event)
    if not user:
        return _response(401, {"error": "Unauthorized"})

    # ── Extract complaint ID from path ───────────────────────────────────────
    path_params = event.get("pathParameters") or {}
    complaint_id = path_params.get("id")
    if not complaint_id:
        return _response(400, {"error": "Missing complaint ID in path"})

    # ── Parse body ───────────────────────────────────────────────────────────
    try:
        body = json.loads(event.get("body", "{}") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    feedback_text = (body.get("feedback") or "").strip()
    if not feedback_text:
        return _response(400, {"error": "feedback field is required and cannot be empty"})

    if len(feedback_text) > 2000:
        return _response(400, {"error": "Feedback text is too long (max 2000 chars)"})

    # ── Verify complaint exists & ownership ──────────────────────────────────
    try:
        table = dynamodb.Table(TABLE_NAME)
        result = table.get_item(Key={"incident_id": complaint_id})
        complaint = result.get("Item")
        if not complaint:
            return _response(404, {"error": "Complaint not found"})

        # Only the complaint owner or an admin can submit feedback
        user_phone = user.get("phone", "")
        complaint_phone = complaint.get("user_phone", "")
        is_owner = (
            user_phone
            and complaint_phone
            and (user_phone in complaint_phone or complaint_phone in user_phone)
        )
        is_admin = user.get("role") == "admin"

        if not is_owner and not is_admin:
            return _response(
                403, {"error": "Only the complaint owner can submit feedback"}
            )

    except ClientError as e:
        logger.error("DynamoDB get_item failed: %s", str(e))
        return _response(500, {"error": "Database error"})

    # ── Run sentiment analysis ───────────────────────────────────────────────
    sentiment_result = analyze_sentiment(feedback_text)

    logger.info(
        "Feedback for %s — sentiment=%s score=%.4f",
        complaint_id,
        sentiment_result["sentiment"],
        sentiment_result["score"],
    )

    # ── Update DynamoDB ──────────────────────────────────────────────────────
    try:
        timestamp = datetime.now(timezone.utc).isoformat()

        table.update_item(
            Key={"incident_id": complaint_id},
            UpdateExpression=(
                "SET feedback_text = :ft, "
                "sentiment = :s, "
                "sentiment_score = :ss, "
                "feedback_timestamp = :ts"
            ),
            ExpressionAttributeValues=_to_decimal(
                {
                    ":ft": feedback_text,
                    ":s": sentiment_result["sentiment"],
                    ":ss": sentiment_result["score"],
                    ":ts": timestamp,
                }
            ),
        )
        logger.info("Updated complaint %s with feedback", complaint_id)

    except ClientError as e:
        logger.error("DynamoDB update failed for %s: %s", complaint_id, str(e))
        return _response(500, {"error": "Failed to save feedback"})

    # ── Response ─────────────────────────────────────────────────────────────
    return _response(
        200,
        {
            "success": True,
            "incident_id": complaint_id,
            "feedback_text": feedback_text,
            "sentiment": sentiment_result["sentiment"],
            "score": sentiment_result["score"],
        },
    )


def _response(status_code, body_obj):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_obj) if isinstance(body_obj, dict) else body_obj,
    }
