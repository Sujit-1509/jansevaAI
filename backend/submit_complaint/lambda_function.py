"""
lambda_function.py — API endpoint to finalize complaint submission.

Route: POST /complaints

Updates an existing "Pending" complaint in DynamoDB (created by process_image),
adding user notes, coordinates, and changing the status to "Submitted".
"""

import json
import logging
import os
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get('REGION', 'ap-south-1')
TABLE_NAME = os.environ.get('TABLE_NAME', 'Complaints')

dynamodb = boto3.resource('dynamodb', region_name=REGION)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

def lambda_handler(event, context):
    method = event.get('httpMethod', '') or event.get('requestContext', {}).get('http', {}).get('method', '')

    if method == "OPTIONS":
        return _response(200, "")

    try:
        data = json.loads(event.get('body', '{}'))
    except Exception:
        return _response(400, {"error": "Invalid request body"})

    s3_key = data.get("s3Key")
    if not s3_key:
        return _response(400, {"error": "s3Key is required"})

    try:
        # Extract incident_id from s3_key (e.g. complaints/123-abc.jpg)
        filename = s3_key.split('/')[-1]
        incident_id = filename.rsplit('.', 1)[0]
    except Exception:
        return _response(400, {"error": "Invalid s3Key format"})

    table = dynamodb.Table(TABLE_NAME)

    # We use update_item to only set the fields that are passed
    update_expr = "SET #st = :status"
    expr_attrs = {"#st": "status"}
    expr_vals = {":status": "Submitted"}

    if data.get("userNote"):
        update_expr += ", user_note = :user_note"
        expr_vals[":user_note"] = data["userNote"]

    if data.get("userName"):
        update_expr += ", user_name = :uname"
        expr_vals[":uname"] = data["userName"]

    if data.get("userPhone"):
        update_expr += ", user_phone = :uphone"
        expr_vals[":uphone"] = data["userPhone"]
    
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
        logger.info(f"Complaint {incident_id} finalized as Submitted")
        
        return _response(200, {
            "success": True,
            "complaintId": incident_id,
            "status": "Submitted",
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
