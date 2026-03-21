import json
import logging
import os
import time
import base64
import hmac
import hashlib
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key
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

VALID_STATUSES = {'submitted', 'assigned', 'in_progress', 'resolved', 'closed'}


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

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _resp(400, {'error': 'Invalid body'})

    incident_ids = body.get('incidentIds', [])
    action       = body.get('action', '')       # 'resolve' | 'close' | 'assign' | 'set_status'
    note         = body.get('note', '')
    worker_phone = body.get('workerPhone', '')
    worker_name  = body.get('workerName', worker_phone)
    new_status   = body.get('status', '')

    if not incident_ids or not isinstance(incident_ids, list):
        return _resp(400, {'error': 'incidentIds list is required'})
    if len(incident_ids) > 100:
        return _resp(400, {'error': 'Max 100 items per bulk operation'})
    if not action:
        return _resp(400, {'error': 'action is required'})

    # Map action to status
    if action == 'resolve':
        target_status = 'resolved'
    elif action == 'close':
        target_status = 'closed'
    elif action == 'assign':
        target_status = 'assigned'
        if not worker_phone:
            return _resp(400, {'error': 'workerPhone required for assign action'})
    elif action == 'set_status':
        if new_status not in VALID_STATUSES:
            return _resp(400, {'error': f'Invalid status. Must be one of: {VALID_STATUSES}'})
        target_status = new_status
    else:
        return _resp(400, {'error': f'Unknown action: {action}'})

    now_iso  = datetime.now(timezone.utc).isoformat()
    actor    = user.get('phone', 'admin')
    results  = {'updated': [], 'failed': []}
    table    = dynamodb.Table(TABLE_NAME)

    for incident_id in incident_ids:
        try:
            history_entry = {
                'status':    target_status,
                'timestamp': now_iso,
                'actor':     actor,
                'note':      note or f'Bulk {action} by admin',
            }

            update_expr = (
                'SET #st = :status, '
                'status_history = list_append('
                '  if_not_exists(status_history, :empty), :entry'
                ')'
            )
            expr_names = {'#st': 'status'}
            expr_vals  = {
                ':status': target_status,
                ':empty':  [],
                ':entry':  [history_entry],
            }

            if action == 'assign':
                update_expr += ', assigned_to = :worker, assigned_to_name = :wname, assigned_at = :at'
                expr_vals[':worker'] = worker_phone
                expr_vals[':wname']  = worker_name
                expr_vals[':at']     = now_iso

            if target_status in ('resolved', 'closed'):
                update_expr += ', resolved_at = :rat'
                expr_vals[':rat'] = now_iso

            table.update_item(
                Key={'incident_id': incident_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_vals,
            )
            results['updated'].append(incident_id)

        except ClientError as exc:
            logger.error('Failed to update %s: %s', incident_id, exc)
            results['failed'].append({'id': incident_id, 'error': str(exc)})

    return _resp(200, {
        'success':       len(results['failed']) == 0,
        'updated_count': len(results['updated']),
        'failed_count':  len(results['failed']),
        'results':       results,
    })


def _resp(code, body):
    return {
        'statusCode': code,
        'headers':    CORS_HEADERS,
        'body':       json.dumps(body) if isinstance(body, dict) else body,
    }
