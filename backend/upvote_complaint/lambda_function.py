"""
lambda_function.py — Increments the upvote count for a specific complaint.

API Gateway route: POST /complaints/{id}/upvote
"""
import json
import logging
import os
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get('TABLE_NAME', 'Complaints')
REGION     = os.environ.get('REGION', 'ap-south-1')

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def _resp(code, body):
    return {
        "statusCode": code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder)
    }

def lambda_handler(event, context):
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', '')
    if method == 'OPTIONS':
        return _resp(200, '')

    # Extract incident_id from path /complaints/{id}/upvote
    path = event.get('path', '') or event.get('rawPath', '')
    parts = [p for p in path.split('/') if p]
    if len(parts) >= 2 and parts[-1] == 'upvote':
        incident_id = parts[-2]
    else:
        # Fallback if mapped to /upvote instead
        incident_id = (event.get('pathParameters') or {}).get('id')

    if not incident_id:
        return _resp(400, {'error': 'Missing incident_id'})

    try:
        # Increment upvotes by 1
        response = table.update_item(
            Key={'incident_id': incident_id},
            UpdateExpression="SET upvotes = if_not_exists(upvotes, :zero) + :inc, priorityScore = if_not_exists(priorityScore, :prio) + :inc_prio",
            ExpressionAttributeValues={
                ':inc': Decimal(1),
                ':zero': Decimal(0),
                ':prio': Decimal(50),      # Default priority score if missing
                ':inc_prio': Decimal(2)    # Boost priority score by 2 points per upvote
            },
            ReturnValues="UPDATED_NEW"
        )
        
        updated = response.get('Attributes', {})
        upvotes = updated.get('upvotes', 1)
        priority_score = updated.get('priorityScore', 52)
        
        logger.info(f"Upvoted {incident_id} -> total {upvotes}, new priority: {priority_score}")
        
        return _resp(200, {
            'success': True,
            'incident_id': incident_id,
            'upvotes': upvotes,
            'newPriorityScore': priority_score
        })
        
    except ClientError as e:
        # Item might not exist yet, though DynamoDB will create it with just these keys if it doesn't unless we use condition
        if e.response['Error']['Code'] == 'ValidationException' or e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return _resp(404, {'error': 'Complaint not found'})
        logger.error(f"DynamoDB error: {e}")
        return _resp(500, {'error': 'Failed to upvote via DB'})
    except Exception as e:
        logger.error(f"Internal error: {e}")
        return _resp(500, {'error': 'Internal server error'})
