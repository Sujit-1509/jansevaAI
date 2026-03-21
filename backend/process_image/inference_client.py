"""
inference_client.py — YOLO inference caller for JanSevaAI Lambda.

Sends the uploaded image reference to the FastAPI YOLO inference server
running on EC2 and returns the classification result.
"""

import logging
import requests

from config import EC2_ENDPOINT, YOLO_TIMEOUT

logger = logging.getLogger(__name__)


def call_yolo(bucket: str, key: str) -> dict:
    """
    Call the FastAPI YOLO inference endpoint on EC2.

    Args:
        bucket: S3 bucket name containing the image.
        key:    S3 object key of the uploaded image.

    Returns:
        dict with keys:
            - category  (str):   Detected issue category (e.g. "pothole").
            - confidence (float): Model confidence score (0–1).

        On failure returns:
            {"category": "Unknown", "confidence": 0.0}
    """
    payload = {"bucket": bucket, "key": key}

    try:
        response = requests.post(
            EC2_ENDPOINT,
            json=payload,
            timeout=YOLO_TIMEOUT,
        )
        response.raise_for_status()
        result = response.json()

        logger.info(
            "YOLO inference succeeded — category=%s confidence=%.2f",
            result.get("category"),
            result.get("confidence"),
        )
        return {
            "category": result.get("category", "Unknown"),
            "confidence": float(result.get("confidence", 0.0)),
        }

    except requests.exceptions.Timeout:
        logger.error("YOLO inference timed out after %ds", YOLO_TIMEOUT)
        return {"category": "Unknown", "confidence": 0.0}

    except requests.exceptions.ConnectionError:
        logger.error("Cannot reach YOLO server at %s", EC2_ENDPOINT)
        return {"category": "Unknown", "confidence": 0.0}

    except requests.exceptions.RequestException as exc:
        logger.error("YOLO inference failed: %s", str(exc))
        return {"category": "Unknown", "confidence": 0.0}
