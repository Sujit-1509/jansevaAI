"""
prompt_builder.py — Amazon Nova complaint text generator for JanSevaAI.

Constructs a structured prompt, invokes Amazon Nova Micro in us-east-1, and returns
a formal municipal complaint description.
"""

import logging
import boto3

logger = logging.getLogger(__name__)

# Nova is in us-east-1
nova_bedrock_client = boto3.client("bedrock-runtime", region_name="us-east-1")

def generate_complaint_text(
    category: str,
    severity: str,
    location: str,
    address: str = None,
) -> str:
    """
    Generate a formal municipal complaint description using Amazon Nova Micro.
    Now accepts an address to generate context-aware, hyper-specific descriptions
    rather than generic boilerplate.
    """
    addr_line = f"Address: {address}\n" if address else ""
    
    prompt_text = (
        f"Generate a formal municipal complaint for:\n"
        f"Issue Type: {category}\n"
        f"Severity: {severity}\n"
        f"{addr_line}\n"
        f"Write a concise, professional complaint description in 3-4 sentences. "
        f"If an address is provided, reference the specific street or area naturally "
        f"in the text to make it specific to the location. "
        f"IMPORTANT: DO NOT include any direct URLs, S3 keys, file names, or technical references in the description. "
        f"Return text only, no headers or formatting."
    )

    try:
        logger.info("Sending text generation prompt to Amazon Nova Micro...")
        
        response = nova_bedrock_client.converse(
            modelId="amazon.nova-micro-v1:0",
            messages=[
                {
                    "role": "user",
                    "content": [{"text": prompt_text}]
                }
            ],
            inferenceConfig={
                "temperature": 0.5,
                "maxTokens": 200
            }
        )
        
        completion = response["output"]["message"]["content"][0]["text"].strip()

        if not completion:
            raise ValueError("Empty completion returned from Nova")

        logger.info("Nova complaint text generated successfully")
        return completion

    except Exception as exc:
        logger.error("Nova text invocation failed: %s", str(exc))
        # Graceful fallback — never let the Lambda crash here
        loc_str = address if address else location
        return (
            f"A {severity.lower()}-severity {category} issue has been reported "
            f"at {loc_str}. Immediate attention is requested from the "
            f"concerned municipal department."
        )
