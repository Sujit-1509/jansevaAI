import json
import logging
import os
import time
import base64
import hmac
import hashlib

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION     = os.environ.get('REGION', 'ap-south-1')
TABLE_NAME = os.environ.get('TABLE_NAME', 'Complaints')
SECRET_KEY = os.environ.get('JWT_SECRET')
if not SECRET_KEY:
    logger.error("JWT_SECRET environment variable is missing!")
SECRET_KEY = SECRET_KEY.encode('utf-8') if SECRET_KEY else b''

dynamodb = boto3.resource('dynamodb', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "DELETE,OPTIONS",
}

def verify_token(event):
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
    method = event.get('httpMethod') or \
             (event.get('requestContext') or {}).get('http', {}).get('method', '')

    if method == 'OPTIONS':
        return _resp(200, '')

    user = verify_token(event)
    if not user:
        return _resp(401, {'error': 'Unauthorized'})

    # Extract complaint id from path /complaints/{id}
    path = event.get('path', '') or event.get('rawPath', '')
    parts = [p for p in path.split('/') if p]
    
    if not parts:
        return _resp(400, {'error': 'Empty path'})
        
    # More robust: incident_id is the last part if it's NOT 'complaints'
    incident_id = parts[-1]
    
    if incident_id == 'complaints' or len(parts) < 1:
        return _resp(400, {'error': 'Missing incident_id in path'})

    table = dynamodb.Table(TABLE_NAME)

    try:
        response = table.get_item(Key={'incident_id': incident_id})
        existing = response.get('Item')
        if not existing:
            return _resp(404, {'error': 'Complaint not found'})
            
        # Check permissions: Admin can delete anything, citizen can only delete their own
        user_phone = user.get('phone')
        user_role = user.get('role')
        
        if user_role != 'admin' and existing.get('user_phone') != user_phone:
            return _resp(403, {'error': 'Forbidden: You can only delete your own complaints'})

        # Execute delete
        table.delete_item(Key={'incident_id': incident_id})
        logger.info('Complaint %s deleted by %s', incident_id, user_phone or 'admin')
        
        return _resp(200, {'success': True, 'message': 'Complaint deleted successfully'})
        
    except ClientError as exc:
        logger.error('DynamoDB API failed: %s', exc)
        return _resp(500, {'error': 'Database error'})
    except Exception as exc:
        logger.error('Unexpected error: %s', exc)
        return _resp(500, {'error': 'Internal server error'})

def _resp(code, body):
    return {
        'statusCode': code,
        'headers':    CORS_HEADERS,
        'body':       json.dumps(body) if isinstance(body, dict) else body,
    }
