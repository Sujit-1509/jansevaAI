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

REGION     = os.environ.get('REGION', 'ap-south-1')
TABLE_NAME = os.environ.get('TABLE_NAME', 'Complaints')
SECRET_KEY = os.environ.get('JWT_SECRET', 'civicai-fallback-secret-key-12345').encode('utf-8')

dynamodb = boto3.resource('dynamodb', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

# SLA hours per category — used when first assigning to set a deadline
SLA_HOURS = {
    'pothole':     48,
    'water':       24,   # water issues are urgent
    'garbage':     72,
    'streetlight': 96,
}
DEFAULT_SLA_HOURS = 72


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
    if user.get('role') != 'admin':
        return _resp(403, {'error': 'Admin only'})

    # Extract complaint id from path /complaints/{id}/assign
    path = event.get('path', '') or event.get('rawPath', '')
    parts = [p for p in path.split('/') if p]
    # expected: ['complaints', '<id>', 'assign']
    if len(parts) < 3 or parts[-1] != 'assign':
        return _resp(400, {'error': 'Invalid path'})
    incident_id = parts[-2]

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _resp(400, {'error': 'Invalid body'})

    worker_phone = body.get('workerPhone')
    worker_name  = body.get('workerName', worker_phone)
    note         = body.get('note', '')

    if not worker_phone:
        return _resp(400, {'error': 'workerPhone is required'})

    now_iso = datetime.now(timezone.utc).isoformat()

    # Build status_history entry
    history_entry = {
        'status':    'assigned',
        'timestamp': now_iso,
        'actor':     user.get('phone', 'admin'),
        'note':      note or f'Assigned to {worker_name}',
    }

    table = dynamodb.Table(TABLE_NAME)

    # Fetch existing record to calculate SLA deadline (only set once)
    try:
        existing = table.get_item(Key={'incident_id': incident_id}).get('Item', {})
    except ClientError as exc:
        logger.error('DynamoDB get failed: %s', exc)
        return _resp(500, {'error': 'Database error'})

    # Compute SLA deadline only if not already set
    sla_deadline = existing.get('sla_deadline')
    if not sla_deadline:
        category = (existing.get('category') or 'pothole').lower()
        sla_hours = SLA_HOURS.get(category, DEFAULT_SLA_HOURS)
        from datetime import timedelta
        deadline_dt = datetime.now(timezone.utc) + timedelta(hours=sla_hours)
        sla_deadline = deadline_dt.isoformat()

    try:
        table.update_item(
            Key={'incident_id': incident_id},
            UpdateExpression=(
                'SET #st = :status, assigned_to = :worker, assigned_to_name = :wname, '
                'assigned_at = :at, sla_deadline = :sla, '
                'status_history = list_append('
                '  if_not_exists(status_history, :empty), :entry'
                ')'
            ),
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={
                ':status': 'assigned',
                ':worker': worker_phone,
                ':wname':  worker_name,
                ':at':     now_iso,
                ':sla':    sla_deadline,
                ':empty':  [],
                ':entry':  [history_entry],
            },
        )
        logger.info('Complaint %s assigned to %s', incident_id, worker_phone)
        return _resp(200, {
            'success':     True,
            'incident_id': incident_id,
            'assigned_to': worker_phone,
            'sla_deadline': sla_deadline,
        })
    except ClientError as exc:
        logger.error('DynamoDB update failed: %s', exc)
        return _resp(500, {'error': 'Failed to assign complaint'})


def _resp(code, body):
    return {
        'statusCode': code,
        'headers':    CORS_HEADERS,
        'body':       json.dumps(body) if isinstance(body, dict) else body,
    }
