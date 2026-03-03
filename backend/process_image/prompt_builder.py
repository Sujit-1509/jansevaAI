"""
prompt_builder.py — Bedrock (Claude) complaint text generator for CivicAI.

Constructs a structured prompt, invokes Amazon Bedrock, and returns
a formal municipal complaint description.
"""

import json
import logging

from aws_utils import bedrock_client
from config import MODEL_ID

logger = logging.getLogger(__name__)


def generate_complaint_text(
    category: str,
    severity: str,
    location: str,
) -> str:
    """
    Generate a formal municipal complaint description using Amazon Bedrock.

    Uses the Claude 3 Messages API format.

    Args:
        category: Detected issue type (e.g. "pothole").
        severity: Severity level (e.g. "High").
        location: Human-readable location or S3 reference.

    Returns:
        Generated complaint text string.
        On failure, returns a static fallback description.
    """
    prompt_text = (
        f"Generate a formal municipal complaint for:\n"
        f"Issue Type: {category}\n"
        f"Severity: {severity}\n"
        f"Location: {location}\n\n"
        f"Write a concise, professional complaint description in 3-4 sentences. "
        f"Return text only, no headers or formatting."
    )

    try:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-10-25",
            "max_tokens": 200,
            "temperature": 0.5,
            "top_p": 0.9,
            "messages": [
                {
                    "role": "user",
                    "content": prompt_text,
                }
            ],
        })

        response = bedrock_client.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        response_body = json.loads(response["body"].read())
        # Claude 3 returns: { "content": [{ "type": "text", "text": "..." }] }
        completion = response_body["content"][0]["text"].strip()

        if not completion:
            raise ValueError("Empty completion returned from Bedrock")

        logger.info("Bedrock complaint text generated successfully")
        return completion

    except Exception as exc:
        logger.error("Bedrock invocation failed: %s", str(exc))
        # Graceful fallback — never let the Lambda crash here
        return (
            f"A {severity.lower()}-severity {category} issue has been reported "
            f"at {location}. Immediate attention is requested from the "
            f"concerned municipal department."
        )
