"""
lambda_function.py — Authentication backend for CivicAI (OTP Flow)

Routes:
- POST /auth/send-otp
- POST /auth/verify-otp

Requires:
- DynamoDB Table 'Users' (Partition key: phone)
- IAM permission for sns:Publish
"""

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
# Secret key for rudimentary JWT signing
SECRET_KEY = os.environ.get('JWT_SECRET', 'civicai-super-secret-key').encode('utf-8')

dynamodb = boto3.resource('dynamodb', region_name=REGION)
sns_client = boto3.client('sns', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

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
    
    return _response(404, {"error": "Not Found"})


def handle_send_otp(body):
    phone = body.get("phone")
    if not phone:
        return _response(400, {"error": "phone is required"})
        
    # Standardize phone number format (assuming India +91 if not provided)
    if not phone.startswith('+'):
        phone = '+91' + phone[-10:]

    # Combine generate OTP
    otp = str(random.randint(100000, 999999))
    expires_at = int(time.time()) + 300  # 5 minutes expiry
    
    table = dynamodb.Table(TABLE_NAME)
    try:
        table.put_item(
            Item={
                "phone": phone,
                "otp": otp,
                "expires_at": expires_at
            }
        )
    except ClientError as e:
        logger.error(f"DynamoDB Error: {e}")
        return _response(500, {"error": "Database error"})

    # Send SMS via SNS
    try:
        # We also generate a fallback response for local UI testing if SNS Sandbox restricts sending
        sns_client.publish(
            PhoneNumber=phone,
            Message=f"Your CivicAI verification code is: {otp}. It expires in 5 minutes.",
            MessageAttributes={
                'AWS.SNS.SMS.SMSType': {
                    'DataType': 'String',
                    'StringValue': 'Transactional'
                }
            }
        )
        logger.info(f"OTP sent to {phone}")
    except ClientError as e:
        logger.error(f"SNS Error: {e}")
        if "No quota" in str(e) or "sandbox" in str(e).lower():
            # Soft fallback in dev if AWS sandbox blocks SMS
            logger.warning(f"SNS Sandbox blocked SMS. OTP is {otp}")
            return _response(200, {"success": True, "message": "OTP generated (SNS sandbox restricted)", "dev_otp": otp})
        return _response(500, {"error": f"Failed to send SMS: {str(e)}"})

    return _response(200, {"success": True, "message": "OTP sent successfully"})


def handle_verify_otp(body):
    phone = body.get("phone")
    user_otp = body.get("otp")
    
    if not phone or not user_otp:
        return _response(400, {"error": "phone and otp are required"})

    if not phone.startswith('+'):
        phone = '+91' + phone[-10:]

    # ── Demo OTP bypass (remove in production) ───────────────────────────
    # Allows any user to log in with OTP "123456" while SNS sandbox is active
    if str(user_otp) == "123456":
        header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode('utf-8').rstrip("=")
        payload_dict = {"phone": phone, "exp": int(time.time()) + 86400 * 7}
        payload = base64.urlsafe_b64encode(json.dumps(payload_dict).encode('utf-8')).decode('utf-8').rstrip("=")
        signature = base64.urlsafe_b64encode(
            hmac.new(SECRET_KEY, f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest()
        ).decode('utf-8').rstrip("=")
        token = f"{header}.{payload}.{signature}"
        logger.info(f"Demo OTP login for {phone}")
        return _response(200, {
            "success": True,
            "token": token,
            "user": {
                "id": f"usr_{phone[-10:]}",
                "phone": phone,
                "role": "citizen"
            }
        })
    # ── End demo OTP bypass ──────────────────────────────────────────────

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

    # Clear OTP
    table.update_item(
        Key={"phone": phone},
        UpdateExpression="REMOVE otp, expires_at"
    )

    # Generate rudimentary JWT equivalent
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode('utf-8').rstrip("=")
    payload_dict = {"phone": phone, "exp": int(time.time()) + 86400 * 7}
    payload = base64.urlsafe_b64encode(json.dumps(payload_dict).encode('utf-8')).decode('utf-8').rstrip("=")
    
    signature = base64.urlsafe_b64encode(
        hmac.new(SECRET_KEY, f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8').rstrip("=")
    
    token = f"{header}.{payload}.{signature}"

    return _response(200, {
        "success": True,
        "token": token,
        "user": {
            "id": f"usr_{phone[-10:]}",
            "phone": phone,
            "role": "citizen"
        }
    })


def _response(status_code, body_obj):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_obj) if isinstance(body_obj, dict) else body_obj
    }
