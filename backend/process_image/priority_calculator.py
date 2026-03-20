import logging
import math
import boto3
from decimal import Decimal
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger(__name__)

# Base scoring weights
SEVERITY_BASE = {
    "high":           40,
    "medium":         25,
    "low":            10,
    "pending review":  5,
}

# Sub-categorized by real-world danger
CATEGORY_BASE = {
    "water":       25,   # Flooding / public health risk
    "pothole":     20,   # Vehicle damage / safety hazard
    "streetlight": 18,   # Night safety / crime risk
    "garbage":     15,   # Sanitation / lower immediate danger
}

DEFAULT_CATEGORY_SCORE = 10

# Nearby duplicates within this radius (~1km ≈ 0.009 deg)
NEARBY_THRESHOLD_DEG = 0.01

def calculate_priority(
    category: str,
    severity: str,
    confidence: float,
    latitude: float = None,
    longitude: float = None,
    address: str = None,
    timestamp_str: str = None,
    table_name: str = None,
) -> int:
    """
    Calculate a priority score (0-100) combining severity, category danger,
    confidence multiplier, non-linear duplicate boosting, location keywords,
    and time decay/escalation.
    """
    cat = category.lower().strip()
    sev = severity.lower().strip()

    # 1. Base Score
    base_score = SEVERITY_BASE.get(sev, 5) + CATEGORY_BASE.get(cat, DEFAULT_CATEGORY_SCORE)

    # 2. Location Multiplier (Address routing logic)
    # Different roads have different impact profiles
    location_multiplier = 1.0
    if address:
        addr = address.lower()
        if any(kw in addr for kw in ["highway", "expressway", "freeway", "nh"]):
            location_multiplier = 1.3  # High-speed danger
        elif any(kw in addr for kw in ["main road", "avenue", "boulevard", "junction", "intersection"]):
            location_multiplier = 1.15 # High traffic
        elif any(kw in addr for kw in ["lane", "alley", "residential", "street"]):
            location_multiplier = 0.9  # Local traffic

    adjusted_base = base_score * location_multiplier

    # 3. Confidence Multiplier
    # Replaces flat-additive bug. If the model is 30% sure, the score is gutted.
    # We clip the bottom floor so a 0% confidence doesn't literally multiply to 0.
    confidence_multiplier = max(0.2, min(confidence, 1.0))
    score = adjusted_base * confidence_multiplier

    # 4. Duplicate Boost (Logarithmic clustering)
    # Fixes the linear uncapped bug. The 10th duplicate matters less than the 2nd.
    duplicate_boost = 0
    if latitude and longitude and table_name:
        try:
            duplicates = _count_nearby_duplicates(cat, latitude, longitude, table_name)
            if duplicates > 0:
                # e.g., 1 dup = ~7, 3 dups = ~10, 10 dups = ~17, capped at 25
                duplicate_boost = min(25, int(math.log1p(duplicates) * 7.5))
        except Exception as exc:
            logger.warning("Duplicate lookup failed: %s", str(exc))

    score += duplicate_boost

    # 5. Time Escalation
    # Stale unresolved issues should gradually escalate to prevent SLAs from breaching silently
    time_boost = 0
    if timestamp_str:
        try:
            # Parse DynamoDB ISO8601 string
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            days_elapsed = (now - dt).days
            if days_elapsed > 0:
                # +2 points per day rotting, capped at +15
                time_boost = min(15, days_elapsed * 2)
        except Exception:
            pass

    score += time_boost

    # Clamp final result to 0-100 gauge
    final_score = max(0, min(100, int(score)))

    logger.info(
        f"Priority Breakdown — base: {base_score}, loc_mult: {location_multiplier:.2f}, "
        f"conf_mult: {confidence_multiplier:.2f}, dup_boost: {duplicate_boost}, "
        f"time_boost: {time_boost} => final: {final_score}"
    )

    return final_score

def _count_nearby_duplicates(
    category: str,
    latitude: float,
    longitude: float,
    table_name: str,
) -> int:
    """Query DynamoDB for similar complaints nearby."""
    dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
    table = dynamodb.Table(table_name)

    lat_min = Decimal(str(latitude - NEARBY_THRESHOLD_DEG))
    lat_max = Decimal(str(latitude + NEARBY_THRESHOLD_DEG))
    lng_min = Decimal(str(longitude - NEARBY_THRESHOLD_DEG))
    lng_max = Decimal(str(longitude + NEARBY_THRESHOLD_DEG))

    try:
        response = table.scan(
            FilterExpression=(
                Attr("category").eq(category)
                & Attr("latitude").between(lat_min, lat_max)
                & Attr("longitude").between(lng_min, lng_max)
            ),
            ProjectionExpression="incident_id",
            Limit=50,
        )
        count = response.get("Count", 0)
        logger.info(
            "Found %d nearby '%s' complaints within %.4f° radius",
            count, category, NEARBY_THRESHOLD_DEG,
        )
        return count
    except Exception as exc:
        logger.warning("DynamoDB scan for duplicates failed: %s", str(exc))
        return 0
