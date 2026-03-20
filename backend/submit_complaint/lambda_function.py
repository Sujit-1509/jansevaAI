import json
import logging
import os
import time
import base64
import hmac
import hashlib
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('REGION', 'ap-south-1')
TABLE_NAME = os.environ.get('TABLE_NAME', 'Complaints')

# Requires JWT_SECRET to be passed in environment
SECRET_KEY = os.environ.get('JWT_SECRET', 'civicai-fallback-secret-key-12345').encode('utf-8')

dynamodb = boto3.resource('dynamodb', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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
        return _response(200, "")

    # Verify JWT First
    user = verify_token(event)
    if not user:
        return _response(401, {"error": "Unauthorized"})

    try:
        data = json.loads(event.get('body', '{}'))
    except Exception:
        return _response(400, {"error": "Invalid request body"})

    s3_key = data.get("s3Key")
    s3_keys = data.get("s3Keys", [])

    # backwards compat: if only s3Key was sent, wrap it
    if not s3_keys and s3_key:
        s3_keys = [s3_key]

    if not s3_keys:
        return _response(400, {"error": "s3Key or s3Keys is required"})

    # primary key is always the first one
    s3_key = s3_keys[0]

    try:
        filename = s3_key.split('/')[-1]
        name_part = filename.rsplit('.', 1)[0]
        # strip the _N suffix to get incident_id
        if '_' in name_part:
            incident_id = name_part.rsplit('_', 1)[0]
        else:
            incident_id = name_part
    except Exception:
        return _response(400, {"error": "Invalid s3Key format"})

    table = dynamodb.Table(TABLE_NAME)

    update_expr = "SET #st = :status, images = :imgs"
    expr_attrs = {"#st": "status"}
    expr_vals = {":status": "submitted", ":imgs": s3_keys}

    if data.get("userNote"):
        update_expr += ", user_note = :user_note"
        expr_vals[":user_note"] = data["userNote"]

    # Enforce token identity over submitted payload for security
    user_name = data.get("userName")
    user_phone = user.get("phone") # Force phone from JWT

    if user_name:
        update_expr += ", user_name = :uname"
        expr_vals[":uname"] = user_name

    if user_phone:
        update_expr += ", user_phone = :uphone"
        expr_vals[":uphone"] = user_phone
    
    if data.get("latitude"):
        update_expr += ", latitude = :lat"
        expr_vals[":lat"] = str(data["latitude"])
        
    if data.get("longitude"):
        update_expr += ", longitude = :lng"
        expr_vals[":lng"] = str(data["longitude"])
        
    if data.get("address"):
        update_expr += ", address = :addr"
        expr_vals[":addr"] = data["address"]

    try:
        # Update DynamoDB record
        table.update_item(
            Key={"incident_id": incident_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_attrs,
            ExpressionAttributeValues=expr_vals
        )
        logger.info(f"Complaint {incident_id} finalized as submitted")
        
        return _response(200, {
            "success": True,
            "complaintId": incident_id,
            "status": "submitted",
            "estimatedResolution": data.get("estimatedResolution", "2-3 days")
        })

    except Exception as e:
        logger.error(f"Failed to update DynamoDB: {e}")
        return _response(500, {"error": "Failed to submit complaint"})


def _response(status_code, body_obj):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_obj) if isinstance(body_obj, dict) else body_obj
    }
