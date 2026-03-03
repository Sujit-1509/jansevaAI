"""
config.py — Environment variable loader for CivicAI process_image Lambda.

Centralizes all environment variable access so that no other module
reads os.environ directly. Provides sensible defaults for local testing.
"""

import os


# ── AWS Region ───────────────────────────────────────────────────────────────
REGION: str = os.environ.get("REGION", "ap-south-1")

# ── S3 ───────────────────────────────────────────────────────────────────────
BUCKET_NAME: str = os.environ.get("BUCKET_NAME", "civicai-images")

# ── DynamoDB ─────────────────────────────────────────────────────────────────
TABLE_NAME: str = os.environ.get("TABLE_NAME", "Complaints")

# ── YOLO FastAPI Inference Endpoint (EC2) ────────────────────────────────────
EC2_ENDPOINT: str = os.environ.get("EC2_ENDPOINT", "http://localhost:8000/predict")

# ── Amazon Bedrock Model ─────────────────────────────────────────────────────
MODEL_ID: str = os.environ.get("MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")

# ── Amazon SES ───────────────────────────────────────────────────────────────
SES_SOURCE_EMAIL: str = os.environ.get("SES_SOURCE_EMAIL", "no-reply@civicai.com")

# ── Timeouts (seconds) ──────────────────────────────────────────────────────
YOLO_TIMEOUT: int = int(os.environ.get("YOLO_TIMEOUT", "10"))
