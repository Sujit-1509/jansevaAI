import json
import logging
import os
import time
import base64
import hmac
import hashlib

import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "Complaints")
REGION = os.environ.get("REGION", "ap-south-1")

SECRET_KEY = os.environ.get('JWT_SECRET', 'civicai-fallback-secret-key-12345').encode('utf-8')

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def verify_token(event):
    """Verify the JWT token locally using HMAC SHA-256."""
    auth_header = event.get('headers', {}).get('Authorization') or event.get('headers', {}).get('authorization')
    if not auth_header:
        return None
        
    token = auth_header.replace('Bearer ', '').strip()
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None

        header, payload, signature = parts

        # verify signature
        expected_sig = base64.urlsafe_b64encode(
            hmac.new(SECRET_KEY, f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest()
        ).decode('utf-8').rstrip("=")

        if not hmac.compare_digest(signature, expected_sig):
            logger.error("Token signature mismatch.")
            return None

        # decode payload
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = json.loads(base64.urlsafe_b64decode(payload))

        # check expiry
        if decoded.get('exp', 0) < int(time.time()):
            logger.error("Token expired.")
            return None

        return decoded
    except Exception as e:
        logger.error(f"Local token verification failed: {e}")
        return None


def lambda_handler(event, context):
    method = event.get('httpMethod', '') or event.get('requestContext', {}).get('http', {}).get('method', '')
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": ""
        }

    try:
        # Verify JWT First
        user = verify_token(event)
        if not user:
            return {
                "statusCode": 401,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Unauthorized"}),
            }

        # Read query string parameters
        params = event.get("queryStringParameters") or {}
        # Citizens can only request their own phone. Admins/workers can request any or all.
        phone = params.get("phone")
        
        if user.get("role") == "citizen":
            if not phone or phone != user.get("phone"):
                # Force them to only query their own phone
                phone = user.get("phone")
                
        status = params.get("status")
        category = params.get("category")

        filter_expressions = []
        if status:
            filter_expressions.append(Attr("status").eq(status))
        if category:
            if category == 'road_issue':
                filter_expressions.append(Attr("category").is_in(['road_issue', 'pothole']))
            elif category == 'waste':
                filter_expressions.append(Attr("category").is_in(['waste', 'garbage']))
            elif category == 'lighting':
                filter_expressions.append(Attr("category").is_in(['lighting', 'streetlight', 'broken_streetlight']))
            else:
                filter_expressions.append(Attr("category").eq(category))

        combined_filter = None
        if filter_expressions:
            combined_filter = filter_expressions[0]
            for expr in filter_expressions[1:]:
                combined_filter = combined_filter & expr

        # Use GSI Query if phone is provided, otherwise full Scan (admins only)
        if phone:
            query_kwargs = {
                "IndexName": "user_phone-index",
                "KeyConditionExpression": Key("user_phone").eq(phone)
            }
            # For backward compatibility with older records that might have used userPhone
            old_query_kwargs = {
                "IndexName": "userPhone-index",
                "KeyConditionExpression": Key("userPhone").eq(phone)
            }
            if combined_filter:
                query_kwargs["FilterExpression"] = combined_filter
                old_query_kwargs["FilterExpression"] = combined_filter
                
            # Query standard GSI
            try:
                response = table.query(**query_kwargs)
                items = response.get("Items", [])
            except Exception as e:
                logger.warning(f"Failed to query user_phone-index: {e}. Falling back to scan.")
                # Fallback if index isn't ready
                scan_kwargs = {"FilterExpression": Attr("user_phone").eq(phone) | Attr("userPhone").eq(phone)}
                if combined_filter:
                    scan_kwargs["FilterExpression"] = scan_kwargs["FilterExpression"] & combined_filter
                response = table.scan(**scan_kwargs)
                items = response.get("Items", [])
        else:
            # Full table scan (only for admins/workers without a specific phone filter)
            scan_kwargs = {}
            if combined_filter:
                scan_kwargs["FilterExpression"] = combined_filter
            response = table.scan(**scan_kwargs)
            items = response.get("Items", [])

        for item in items:
            stat = str(item.get("status", "")).strip().lower().replace(" ", "_")
            item["status"] = "submitted" if stat in ("", "pending") else stat

        return {
            "statusCode": 200,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps(
                {"success": True, "complaints": items, "total": len(items)},
                default=str,
            ),
        }
    except Exception as exc:
        logger.error("DynamoDB read failed: %s", str(exc))
        return {
            "statusCode": 500,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({"error": "Database read failed"}),
        }
