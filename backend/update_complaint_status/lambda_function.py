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
SECRET_KEY = os.environ.get('JWT_SECRET', 'JanSevaAI-fallback-secret-key-12345').encode('utf-8')

dynamodb = boto3.resource('dynamodb', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "PATCH,POST,OPTIONS",
}

VALID_STATUSES    = {'submitted', 'assigned', 'in_progress', 'resolved', 'closed'}
VALID_WK_ACTIONS  = {'accepted', 'rejected'}


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

    role = user.get('role', 'citizen')
    if role not in ('admin', 'worker'):
        return _resp(403, {'error': 'Admin or worker only'})

    # Extract incident_id from path /complaints/{id}/status
    path   = event.get('path', '') or event.get('rawPath', '')
    parts  = [p for p in path.split('/') if p]
    if len(parts) < 2:
        return _resp(400, {'error': 'Invalid path'})
    incident_id = parts[-2] if parts[-1] == 'status' else parts[-1]

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _resp(400, {'error': 'Invalid body'})

    new_status      = (body.get('status') or '').lower().replace('-', '_')
    note            = body.get('notes') or body.get('note', '')
    worker_action   = (body.get('workerAction') or '').lower()   # 'accepted' | 'rejected'
    proof_s3_key    = body.get('proofS3Key', '')                  # S3 key of resolution photo
    resolve_location = body.get('resolveLocation')                # { lat, lng } GPS coords

    # Validate status
    if new_status and new_status not in VALID_STATUSES:
        return _resp(400, {'error': f'Invalid status: {new_status}'})

    # Workers can only move to: accepted (in_progress), rejected (back to submitted), resolved
    if role == 'worker':
        allowed = {'in_progress', 'resolved', 'submitted'}
        if new_status and new_status not in allowed:
            return _resp(403, {'error': f'Workers cannot set status to {new_status}'})

    now_iso = datetime.now(timezone.utc).isoformat()
    actor   = user.get('phone', role)

    # Build the status_history entry
    history_entry = {
        'status':    new_status or worker_action or 'updated',
        'timestamp': now_iso,
        'actor':     actor,
        'note':      note,
    }
    if proof_s3_key:
        history_entry['proof_s3_key'] = proof_s3_key
    if worker_action:
        history_entry['worker_action'] = worker_action
    if resolve_location:
        history_entry['resolve_location'] = resolve_location

    # Build DynamoDB update expression dynamically
    update_parts = [
        'status_history = list_append(if_not_exists(status_history, :empty), :entry)'
    ]
    expr_names = {}
    expr_vals  = {':empty': [], ':entry': [history_entry]}

    if new_status:
        update_parts.append('#st = :status')
        expr_names['#st'] = 'status'
        expr_vals[':status'] = new_status

    if worker_action in VALID_WK_ACTIONS:
        update_parts.append('worker_action = :waction')
        expr_vals[':waction'] = worker_action

    if proof_s3_key:
        update_parts.append('resolution_proof_key = :proof')
        expr_vals[':proof'] = proof_s3_key

    if new_status in ('resolved', 'closed'):
        update_parts.append('resolved_at = :rat')
        expr_vals[':rat'] = now_iso

    if resolve_location and isinstance(resolve_location, dict):
        update_parts.append('resolve_location = :rloc')
        expr_vals[':rloc'] = resolve_location

    table = dynamodb.Table(TABLE_NAME)
    try:
        update_kwargs = {
            'Key': {'incident_id': incident_id},
            'UpdateExpression': 'SET ' + ', '.join(update_parts),
            'ExpressionAttributeValues': expr_vals,
            'ReturnValues': 'ALL_NEW',
        }
        # Only include ExpressionAttributeNames when non-empty — passing None crashes DynamoDB
        if expr_names:
            update_kwargs['ExpressionAttributeNames'] = expr_names

        result = table.update_item(**update_kwargs)
        updated = result.get('Attributes', {})
        logger.info('Updated complaint %s to %s by %s', incident_id, new_status, actor)
        return _resp(200, {
            'success':        True,
            'incident_id':    incident_id,
            'status':         updated.get('status'),
            'status_history': updated.get('status_history', []),
        })
    except ClientError as exc:
        logger.error('DynamoDB update failed: %s', exc)
        return _resp(500, {'error': 'Failed to update complaint'})


def _resp(code, body):
    return {
        'statusCode': code,
        'headers':    CORS_HEADERS,
        'body':       json.dumps(body) if isinstance(body, dict) else body,
    }
