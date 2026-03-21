"""
vision_fallback.py — Amazon Nova Vision fallback classifier for JanSevaAI.

When the YOLOv8 model returns "Unknown", this module
sends the image to Amazon Nova Lite in us-east-1 for classification.
Since Nova is an AWS first-party model, it uses AWS Credits without
requiring a Marketplace credit card.
"""

import json
import logging
import boto3

from aws_utils import s3_client

logger = logging.getLogger(__name__)

# Nova is in us-east-1, so we must make a region-specific client
nova_bedrock_client = boto3.client("bedrock-runtime", region_name="us-east-1")

VALID_CATEGORIES = ["pothole", "garbage", "streetlight", "water"]

def classify_with_nova(bucket: str, key: str) -> dict:
    """
    Download image from S3 in ap-south-1, and classify using Amazon Nova Lite in us-east-1.
    """
    try:
        logger.info("Nova Vision fallback — downloading s3://%s/%s", bucket, key)
        response = s3_client.get_object(Bucket=bucket, Key=key)
        image_bytes = response["Body"].read()

        # Determine media format (Nova supports jpeg, png, webp, gif)
        ext = key.rsplit(".", 1)[-1].lower()
        if ext == "jpg":
            ext = "jpeg"
        if ext not in ["jpeg", "png", "webp", "gif"]:
            ext = "jpeg" # fallback default

        prompt_text = (
            "You are an AI classifier for a municipal complaint system. "
            "Analyze this image and classify it into EXACTLY ONE of these categories:\n"
            "- pothole (road damage, cracks, holes in road surface)\n"
            "- garbage (waste, trash, litter, debris, dump sites)\n"
            "- streetlight (broken, damaged, or non-functional street lights)\n"
            "- water (waterlogging, flooding, stagnant water, sewage overflow)\n\n"
            "Respond with ONLY a JSON object, exactly like this:\n"
            '{"category": "pothole", "confidence": 0.95}'
        )

        logger.info("Sending image to Amazon Nova Lite in us-east-1...")
        response = nova_bedrock_client.converse(
            modelId="amazon.nova-lite-v1:0",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"text": prompt_text},
                        {
                            "image": {
                                "format": ext,
                                "source": {"bytes": image_bytes}
                            }
                        }
                    ]
                }
            ],
            inferenceConfig={
                "temperature": 0.1,
                "maxTokens": 100
            }
        )

        # Extract text from Converse API response
        completion = response["output"]["message"]["content"][0]["text"].strip()
        
        # Strip potential markdown code blocks
        if completion.startswith("```"):
            completion = completion.split("\n", 1)[1]
            if completion.endswith("```"):
                completion = completion.rsplit("\n", 1)[0]
                
        result = json.loads(completion)
        
        category = result.get("category", "Unknown").lower()
        confidence = float(result.get("confidence", 0.0))

        if category not in VALID_CATEGORIES:
            logger.warning("Nova returned invalid category: %s", category)
            category = "Unknown"
            confidence = 0.0

        logger.info(
            "Nova Vision classified — category=%s confidence=%.2f",
            category, confidence,
        )
        return {"category": category, "confidence": confidence}

    except Exception as exc:
        logger.error("Nova Vision fallback failed: %s", str(exc))
        return {"category": "Unknown", "confidence": 0.0}
