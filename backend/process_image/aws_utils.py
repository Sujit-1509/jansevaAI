"""
aws_utils.py — Centralized boto3 client factory for CivicAI Lambda.

Creates and caches boto3 clients for S3, DynamoDB, SES, and Bedrock Runtime.
Clients are initialized once per Lambda cold-start and reused across invocations.
"""

import boto3
from config import REGION


# ── Cached boto3 Clients (initialized once per cold-start) ──────────────────

s3_client = boto3.client("s3", region_name=REGION)

dynamodb_resource = boto3.resource("dynamodb", region_name=REGION)

ses_client = boto3.client("ses", region_name=REGION)

bedrock_client = boto3.client("bedrock-runtime", region_name=REGION)
