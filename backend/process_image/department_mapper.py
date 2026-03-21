"""
department_mapper.py — Category-to-department mapper for JanSevaAI Lambda.

Maps detected issue categories to the responsible municipal department.
"""

import logging

logger = logging.getLogger(__name__)

# ── Department Lookup Table ──────────────────────────────────────────────────
DEPARTMENT_MAP: dict[str, str] = {
    "pothole":     "Road Department",
    "garbage":     "Sanitation",
    "water":       "Water Board",
    "streetlight": "Electrical Department",
}

DEFAULT_DEPARTMENT: str = "General Department"


def get_department(category: str) -> str:
    """
    Return the municipal department responsible for a given issue category.

    Args:
        category: Detected issue type (case-insensitive).

    Returns:
        Department name string.  Falls back to "General Complaints"
        if the category is not recognized.
    """
    cat = category.lower().strip()
    department = DEPARTMENT_MAP.get(cat, DEFAULT_DEPARTMENT)

    if department == DEFAULT_DEPARTMENT:
        logger.info(
            "No specific department for category '%s' — using '%s'",
            category,
            DEFAULT_DEPARTMENT,
        )

    return department
