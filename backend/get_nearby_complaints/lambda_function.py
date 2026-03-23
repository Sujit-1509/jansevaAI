"""
lambda_function.py — Fetches complaints within a radius (demo logic).

API Gateway route: GET /complaints/nearby
"""
import json
import logging
import os
import math
from decimal import Decimal

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ.get('TABLE_NAME', 'Complaints')
REGION     = os.environ.get('REGION', 'ap-south-1')

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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

def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two lat/lng coordinates."""
    # Convert latitude and longitude from degrees to radians
    R = 6371000  # Radius of earth in meters
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

def lambda_handler(event, context):
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', '')
    if method == 'OPTIONS':
        return _resp(200, '')

    qs = event.get('queryStringParameters') or {}
    try:
        target_lat = float(qs.get('lat', 0))
        target_lng = float(qs.get('lng', 0))
        radius_m = float(qs.get('radius', 500))  # Default 500 meters
    except ValueError:
        return _resp(400, {'error': 'Invalid lat, lng, or radius'})

    # If no valid lat/lng provided, return empty
    if target_lat == 0 and target_lng == 0:
        return _resp(200, {'success': True, 'complaints': [], 'total': 0})

    try:
        # Full scan - OK for hackathon/demo scale (< 1MB)
        response = table.scan()
        items = response.get('Items', [])
        
        # Handle pagination if necessary
        while 'LastEvaluatedKey' in response:
            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            items.extend(response.get('Items', []))

        # Filter by distance
        nearby = []
        for item in items:
            status = str(item.get('status', '')).lower()
            if status in ('resolved', 'closed'):
                continue # Skip resolved items typically for nearby requests
                
            ilat = item.get('latitude')
            ilng = item.get('longitude')
            
            if ilat is not None and ilng is not None:
                try:
                    dist = haversine(target_lat, target_lng, float(ilat), float(ilng))
                    if dist <= radius_m:
                        item['distance_meters'] = int(dist)
                        nearby.append(item)
                except (ValueError, TypeError):
                    continue

        # Sort by closest
        nearby.sort(key=lambda x: x['distance_meters'])
        
        # Limit to top 20 for perf
        nearby = nearby[:20]

        return _resp(200, {
            'success': True,
            'total': len(nearby),
            'radius': radius_m,
            'complaints': nearby
        })

    except Exception as e:
        logger.error(f"Failed to scan and filter nearby: {e}")
        return _resp(500, {'error': 'Internal server error'})
