"""
severity_rules.py — Rule-based severity calculator for CivicAI Lambda.

Assigns a human-readable severity level based on the detected issue
category and model confidence score.
"""

import logging

logger = logging.getLogger(__name__)


def calculate_severity(category: str, confidence: float) -> str:
    """
    Determine complaint severity from category and confidence.

    Rules:
        • pothole  AND  confidence > 0.8  →  "High"
        • garbage  (any confidence)       →  "Medium"
        • Unknown / fallback              →  "Low"

    Args:
        category:   Detected issue type (lowercase).
        confidence: Model confidence (0–1).

    Returns:
        Severity string: "High", "Medium", "Low", or "Pending Review".
    """
    cat = category.lower().strip()

    # Unknown category from a YOLO failure → flag for manual review
    if cat == "unknown":
        logger.warning("Category is Unknown — severity set to Pending Review")
        return "Pending Review"

    if cat == "pothole" and confidence > 0.8:
        return "High"

    if cat == "water":
        return "High"

    if cat == "garbage":
        return "Medium"

    # All other categories default to Low
    return "Low"
