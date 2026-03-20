"""
lambda_function.py — Update Complaint Status

API Gateway route: PATCH /complaints/{id}/status
Body payload: { "status": "in_progress", "notes": "Working on it" }
"""

import json
import logging
import os
import boto3
import base64
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "Complaints")
REGION = os.environ.get("REGION", "ap-south-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "PATCH,OPTIONS",
}


def _decode_token_role(event):
    auth_header = event.get("headers", {}).get("Authorization") or event.get("headers", {}).get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1]
    parts = token.split(".")
    if len(parts) != 3:
        return None

    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding).decode("utf-8")
        data = json.loads(decoded)
    except Exception:
        return None

    return data.get("role")


def lambda_handler(event, context):
    try:
        role = _decode_token_role(event)
        if role not in {"admin", "worker"}:
            return {
                "statusCode": 403,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Forbidden"}),
            }

        # Extract incident ID from path parameters
        path_params = event.get("pathParameters") or {}
        incident_id = path_params.get("id")

        if not incident_id:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Missing complaint ID"}),
            }

        # Parse the JSON body
        body = json.loads(event.get("body", "{}"))
        new_status = body.get("status")

        if not new_status:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Missing new status"}),
            }

        # Validate the status
        valid_statuses = ["submitted", "assigned", "in_progress", "resolved", "closed"]
        if new_status not in valid_statuses:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Invalid status. Must be one of: {valid_statuses}"}),
            }

        # Build update expression
        update_expr = "SET #st = :s"
        expr_attr_names = {"#st": "status"}
        expr_attr_values = {":s": new_status}

        # If it's being resolved or closed, we can add a resolved_at timestamp
        if new_status in ["resolved", "closed"]:
            update_expr += ", resolvedAt = :ra"
            expr_attr_values[":ra"] = datetime.utcnow().isoformat() + "Z"

        # Update the DynamoDB record
        response = table.update_item(
            Key={"incident_id": incident_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values,
            ReturnValues="ALL_NEW"
        )

        updated_item = response.get("Attributes", {})

        return {
            "statusCode": 200,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({
                "success": True, 
                "message": f"Complaint {incident_id} updated to {new_status}",
                "updatedRecord": updated_item
            }, default=str),
        }

    except Exception as exc:
        logger.error(f"Failed to update status: {str(exc)}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Failed to update complaint status"}),
        }
