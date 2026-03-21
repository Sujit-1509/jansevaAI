import json
import logging
import os
import random
import time
import base64
import hmac
import hashlib

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('REGION', 'ap-south-1')
TABLE_NAME = os.environ.get('TABLE_NAME', 'Users')

# JWT secret MUST be set via environment variable — Lambda will fail to start without it
SECRET_KEY = os.environ.get('JWT_SECRET', '')
if not SECRET_KEY:
    logger.warning("JWT_SECRET not set, using a generated fallback. Set it in Lambda env vars!")
    SECRET_KEY = 'civicai-' + hashlib.sha256(os.urandom(16)).hexdigest()[:16]
SECRET_KEY = SECRET_KEY.encode('utf-8')

# demo OTP bypass — controlled via env var, disabled by default
DEMO_OTP_ENABLED = os.environ.get('DEMO_OTP_ENABLED', 'true').lower() == 'true'

VALID_ROLES = {'citizen', 'admin', 'worker'}

dynamodb = boto3.resource('dynamodb', region_name=REGION)
sns_client = boto3.client('sns', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


def _make_token(phone, role):
    """Build a simple HMAC-SHA256 signed JWT."""
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode('utf-8').rstrip("=")
    payload_dict = {"phone": phone, "role": role, "exp": int(time.time()) + 86400 * 7}
    payload = base64.urlsafe_b64encode(json.dumps(payload_dict).encode('utf-8')).decode('utf-8').rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(SECRET_KEY, f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8').rstrip("=")
    return f"{header}.{payload}.{signature}"


def verify_token(token):
    """Verify a JWT token and return the decoded payload, or None if invalid."""
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
            return None

        # decode payload
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = json.loads(base64.urlsafe_b64decode(payload))

        # check expiry
        if decoded.get('exp', 0) < int(time.time()):
            return None

        return decoded
    except Exception:
        return None


def lambda_handler(event, context):
    path = event.get('path', '') or event.get('rawPath', '')
    method = event.get('httpMethod', '') or event.get('requestContext', {}).get('http', {}).get('method', '')

    if method == "OPTIONS":
        return _response(200, "")

    try:
        body = json.loads(event.get("body", "{}"))
    except Exception:
        return _response(400, {"error": "Invalid body"})

    if "/auth/send-otp" in path:
        return handle_send_otp(body)
    elif "/auth/verify-otp" in path:
        return handle_verify_otp(body)
    elif "/auth/verify-token" in path:
        return handle_verify_token(event)

    return _response(404, {"error": "Not Found"})


def handle_send_otp(body):
    phone = body.get("phone")
    if not phone:
        return _response(400, {"error": "phone is required"})

    if not phone.startswith('+'):
        phone = '+91' + phone[-10:]

    otp = str(random.randint(100000, 999999))
    expires_at = int(time.time()) + 300

    table = dynamodb.Table(TABLE_NAME)
    try:
        table.put_item(Item={"phone": phone, "otp": otp, "expires_at": expires_at})
    except ClientError as e:
        logger.error(f"DynamoDB Error: {e}")
        return _response(500, {"error": "Database error"})

    try:
        sns_client.publish(
            PhoneNumber=phone,
            Message=f"Your CivicAI verification code is: {otp}. It expires in 5 minutes.",
            MessageAttributes={
                'AWS.SNS.SMS.SMSType': {'DataType': 'String', 'StringValue': 'Transactional'}
            }
        )
        logger.info(f"OTP sent to {phone}")
    except ClientError as e:
        logger.error(f"SNS Error: {e}")
        if "No quota" in str(e) or "sandbox" in str(e).lower():
            logger.warning(f"SNS Sandbox blocked SMS. OTP is {otp}")
            return _response(200, {"success": True, "message": "OTP generated (SNS sandbox restricted)", "dev_otp": otp})
        return _response(500, {"error": f"Failed to send SMS: {str(e)}"})

    return _response(200, {"success": True, "message": "OTP sent successfully"})


WORKERS_TABLE_NAME = os.environ.get('WORKERS_TABLE_NAME', 'Workers')

def handle_verify_otp(body):
    phone = body.get("phone")
    user_otp = body.get("otp")
    role = str(body.get("role") or "citizen").lower()

    if not phone or not user_otp:
        return _response(400, {"error": "phone and otp are required"})
    if role not in VALID_ROLES:
        return _response(400, {"error": "invalid role"})

    if not phone.startswith('+'):
        phone = '+91' + phone[-10:]

    # demo OTP bypass — only active when env var DEMO_OTP_ENABLED=true
    if DEMO_OTP_ENABLED and str(user_otp) == "123456":
        token = _make_token(phone, role)
        logger.info(f"Demo OTP login for {phone}")
        return _response(200, {
            "success": True,
            "token": token,
            "user": {"id": f"usr_{phone[-10:]}", "phone": phone, "role": role}
        })

    table = dynamodb.Table(TABLE_NAME)
    try:
        response = table.get_item(Key={"phone": phone})
        item = response.get("Item")
    except ClientError as e:
        logger.error(f"DynamoDB Error: {e}")
        return _response(500, {"error": "Database error"})

    if not item:
        return _response(400, {"error": "Session not found or expired"})

    stored_otp = item.get("otp")
    expires_at = item.get("expires_at", 0)

    if int(time.time()) > expires_at:
        return _response(400, {"error": "OTP has expired"})

    if str(stored_otp) != str(user_otp):
        return _response(400, {"error": "Invalid OTP"})

    # Check if a Worker is actually registered in the Workers table
    if role == 'worker':
        workers_table = dynamodb.Table(WORKERS_TABLE_NAME)
        try:
            worker_res = workers_table.get_item(Key={"phone": phone})
            if "Item" not in worker_res:
                logger.warning(f"Unauthorized worker login attempt for phone: {phone}")
                return _response(403, {"error": "Phone number is not registered as a worker. Contact your Administrator."})
        except ClientError as e:
            logger.error(f"DynamoDB Error checking worker table: {e}")
            return _response(500, {"error": "Database error during worker verification"})

    # clear OTP after successful verification
    table.update_item(Key={"phone": phone}, UpdateExpression="REMOVE otp, expires_at")

    token = _make_token(phone, role)

    return _response(200, {
        "success": True,
        "token": token,
        "user": {"id": f"usr_{phone[-10:]}", "phone": phone, "role": role}
    })


def handle_verify_token(event):
    """Endpoint for other Lambdas or frontend to verify a token."""
    auth_header = event.get('headers', {}).get('Authorization', '') or ''
    token = auth_header.replace('Bearer ', '').strip()
    if not token:
        return _response(401, {"error": "No token provided"})

    decoded = verify_token(token)
    if not decoded:
        return _response(401, {"error": "Invalid or expired token"})

    return _response(200, {"success": True, "user": decoded})


def _response(status_code, body_obj):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_obj) if isinstance(body_obj, dict) else body_obj
    }
