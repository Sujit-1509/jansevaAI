import json
import logging
import os
import time
import base64
import hmac
import hashlib
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('REGION', 'ap-south-1')
TABLE_NAME = os.environ.get('TABLE_NAME', 'Workers')
SECRET_KEY = os.environ.get('JWT_SECRET', 'JanSevaAI-fallback-secret-key-12345').encode('utf-8')

dynamodb = boto3.resource('dynamodb', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}


def verify_token(event):
    """Verify the JWT token locally using HMAC SHA-256."""
    auth = (event.get('headers') or {}).get('Authorization') or \
           (event.get('headers') or {}).get('authorization', '')
    token = auth.replace('Bearer ', '').strip()
    if not token:
        return None
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header, payload, sig = parts
        expected = base64.urlsafe_b64encode(
            hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest()
        ).decode().rstrip('=')
        if not hmac.compare_digest(sig, expected):
            return None
        pad = 4 - len(payload) % 4
        if pad != 4:
            payload += '=' * pad
        decoded = json.loads(base64.urlsafe_b64decode(payload))
        if decoded.get('exp', 0) < int(time.time()):
            return None
        return decoded
    except Exception:
        return None


def lambda_handler(event, context):
    method = event.get('httpMethod', '') or event.get('requestContext', {}).get('http', {}).get('method', '')
    
    if method == "OPTIONS":
        return _response(200, "")

    # Verify JWT — admin only
    logger.info(f"Method: {method}, Headers: {json.dumps(event.get('headers', {}))}")
    user = verify_token(event)
    logger.info(f"Verify Token Result: {user}")
    
    if not user:
        logger.warning("Unauthorized access attempt: No user found in token.")
        return _response(401, {"error": "Unauthorized"})
    
    if user.get('role') != 'admin':
        logger.warning(f"Forbidden access: {user.get('phone')} is role {user.get('role')}")
        return _response(403, {"error": "Admin only"})


    try:
        if method == "GET":
            return handle_get_workers()
        elif method == "POST":
            body = json.loads(event.get("body", "{}"))
            return handle_add_worker(body)
        elif method == "DELETE":
            # APIGW Proxy might pass phone in pathParameters
            path_params = event.get("pathParameters") or {}
            phone = path_params.get("phone")
            if not phone:
                # Fallback to body if path param is missing
                body = json.loads(event.get("body", "{}"))
                phone = body.get("phone")
            return handle_delete_worker(phone)
            
        return _response(405, {"error": "Method not allowed"})
    except Exception as e:
        logger.error(f"Error processing request: {e}")
        return _response(500, {"error": "Internal server error"})

def handle_get_workers():
    try:
        table = dynamodb.Table(TABLE_NAME)
        response = table.scan()
        workers = response.get('Items', [])
        
        # Sort by creation date descending
        workers.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return _response(200, {
            "success": True,
            "workers": workers
        })
    except ClientError as e:
        logger.error(f"DynamoDB Error: {e}")
        return _response(500, {"error": "Database error while fetching workers"})

def handle_add_worker(body):
    phone = body.get("phone")
    name = body.get("name")
    department = body.get("department", "General")
    added_by = body.get("added_by", "Admin")
    
    if not phone or not name:
        return _response(400, {"error": "phone and name are required"})
        
    if not phone.startswith('+'):
        phone = '+91' + phone[-10:]
        
    try:
        table = dynamodb.Table(TABLE_NAME)
        # Check if exists
        res = table.get_item(Key={"phone": phone})
        if 'Item' in res:
            return _response(400, {"error": "Worker already exists with this phone number"})
            
        timestamp = datetime.now(timezone.utc).isoformat()
        worker_item = {
            "phone": phone,
            "name": name,
            "department": department,
            "added_by": added_by,
            "created_at": timestamp
        }
        
        table.put_item(Item=worker_item)
        logger.info(f"Added new worker: {name} ({phone})")
        
        return _response(200, {
            "success": True,
            "message": "Worker added successfully",
            "worker": worker_item
        })
    except ClientError as e:
        logger.error(f"DynamoDB Error: {e}")
        return _response(500, {"error": "Database error while adding worker"})

def handle_delete_worker(phone):
    if not phone:
        return _response(400, {"error": "phone is required for deletion"})
        
    if not phone.startswith('+'):
        if len(phone) == 10:
            phone = '+91' + phone
        else:
            phone = '+' + phone.lstrip()

    try:
        table = dynamodb.Table(TABLE_NAME)
        table.delete_item(Key={"phone": phone})
        logger.info(f"Deleted worker: {phone}")
        return _response(200, {
            "success": True,
            "message": "Worker removed successfully"
        })
    except ClientError as e:
        logger.error(f"DynamoDB Error: {e}")
        return _response(500, {"error": "Database error while deleting worker"})

def _response(status_code, body_obj):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_obj) if isinstance(body_obj, dict) else body_obj
    }
