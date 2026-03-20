"""
lambda_function.py — Get complaint by incident_id from DynamoDB.

API Gateway route: GET /complaints/{id}
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME", "Complaints")
REGION = os.environ.get("REGION", "ap-south-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    # Get incident_id from path parameters
    path_params = event.get("pathParameters") or {}
    incident_id = path_params.get("id")

    # Fallback: extract from raw path (e.g., /complaints/abc-123)
    if not incident_id:
        raw_path = event.get("path", "") or event.get("rawPath", "")
        if "/complaints/" in raw_path:
            incident_id = raw_path.split("/complaints/")[-1].strip("/")

    if not incident_id:
        return {
            "statusCode": 400,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing incident_id in path"}),
        }

    try:
        response = table.get_item(Key={"incident_id": incident_id})
    except Exception as exc:
        logger.error("DynamoDB read failed: %s", str(exc))
        return {
            "statusCode": 500,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({"error": "Database read failed"}),
        }

    item = response.get("Item")

    if not item:
        return {
            "statusCode": 404,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({"error": "Complaint not found"}),
        }

    logger.info("Found complaint: %s", incident_id)
    item["status"] = str(item.get("status", "")).strip().lower().replace(" ", "_") or "submitted"

    return {
        "statusCode": 200,
        "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps({"success": True, "complaint": item}, default=str),
    }
