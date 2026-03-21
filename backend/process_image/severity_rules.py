"""
severity_rules.py — Rule-based severity calculator for JanSevaAI Lambda.

Assigns a human-readable severity level based on the detected issue
category and model confidence score. Incorporates confidence directly
to downgrade severity on uncertain detections.
"""

import logging

logger = logging.getLogger(__name__)

def calculate_severity(category: str, confidence: float) -> str:
    """
    Determine complaint severity from category and confidence.

    Rules:
        • Uncertain predictions (< 0.40)      → "Pending Review"
        • Low confidence predictions (< 0.60) → "Low" (max)
        • Pothole/Water (> 0.80)              → "High"
        • Garbage/Streetlight (> 0.70)        → "Medium"

    Args:
        category:   Detected issue type (lowercase).
        confidence: Model confidence (0–1).

    Returns:
        Severity string: "High", "Medium", "Low", or "Pending Review".
    """
    cat = category.lower().strip()

    # Unknown category or very low confidence → flag for manual review
    if cat == "unknown" or confidence < 0.40:
        logger.warning("Category is %s with %.2f confidence — severity set to Pending Review", cat, confidence)
        return "Pending Review"

    # Heavily penalize low confidence detections across the board
    if confidence < 0.60:
        return "Low"

    # Potholes and Water can be critical safety/infrastructure hazards
    if cat in ["pothole", "water"]:
        if confidence > 0.80:
            return "High"
        return "Medium"

    # Garbage and Streetlights max out at Medium severity
    if cat in ["garbage", "streetlight"]:
        if confidence > 0.70:
            return "Medium"
        return "Low"

    # All other categories default to Low
    return "Low"
