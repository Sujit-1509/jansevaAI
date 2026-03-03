"""
lambda_function.py — Main handler for CivicAI process_image Lambda.

Triggered by an S3 ObjectCreated event. Orchestrates:
    1. Extract S3 event metadata (bucket, key, incident_id)
    2. Call YOLO inference server for image classification
    3. Calculate severity using rule-based logic
    4. Map category to responsible municipal department
    5. Generate formal complaint text via Amazon Bedrock (Claude)
    6. Persist complaint record to DynamoDB
    7. Send email notification via Amazon SES

All heavy lifting is delegated to modular helper files.
"""

import json
import logging
import urllib.parse
from datetime import datetime, timezone

from config import TABLE_NAME, SES_SOURCE_EMAIL
from aws_utils import dynamodb_resource, ses_client
from inference_client import call_yolo
from severity_rules import calculate_severity
from department_mapper import get_department
from prompt_builder import generate_complaint_text

# ── Structured Logging ───────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)


# ═══════════════════════════════════════════════════════════════════════════════
#  DynamoDB Helper
# ═══════════════════════════════════════════════════════════════════════════════

def save_to_dynamodb(item: dict) -> None:
    """
    Persist a complaint record to the DynamoDB 'Complaints' table.

    Args:
        item: Dictionary matching the Complaints table schema.

    Raises:
        Logs error on failure but does NOT raise — Lambda should not crash.
    """
    try:
        table = dynamodb_resource.Table(TABLE_NAME)
        table.put_item(Item=item)
        logger.info(
            "Saved complaint %s to DynamoDB", item.get("incident_id")
        )
    except Exception as exc:
        logger.error(
            "DynamoDB put_item failed for %s: %s",
            item.get("incident_id"),
            str(exc),
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  SES Email Helper
# ═══════════════════════════════════════════════════════════════════════════════

def send_email_notification(
    incident_id: str,
    department: str,
    category: str,
    severity: str,
    complaint_text: str,
) -> None:
    """
    Send an email notification about a new civic complaint via Amazon SES.

    Args:
        incident_id:    Unique complaint identifier.
        department:     Responsible municipal department.
        category:       Detected issue category.
        severity:       Calculated severity level.
        complaint_text: Generated formal complaint description.

    Raises:
        Logs error on failure but does NOT raise.
    """
    subject = f"New Civic Complaint - {incident_id}"

    body = (
        f"A new civic complaint has been filed.\n\n"
        f"══════════════════════════════════════\n"
        f"  Complaint ID : {incident_id}\n"
        f"  Category     : {category}\n"
        f"  Severity     : {severity}\n"
        f"  Department   : {department}\n"
        f"══════════════════════════════════════\n\n"
        f"Description:\n{complaint_text}\n\n"
        f"Please take appropriate action.\n"
        f"— CivicAI Automated System"
    )

    try:
        ses_client.send_email(
            Source=SES_SOURCE_EMAIL,
            Destination={
                "ToAddresses": [SES_SOURCE_EMAIL],  # Route to ops inbox
            },
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": body, "Charset": "UTF-8"},
                },
            },
        )
        logger.info("Email notification sent for %s", incident_id)

    except Exception as exc:
        logger.error(
            "SES send_email failed for %s: %s", incident_id, str(exc)
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  Lambda Handler
# ═══════════════════════════════════════════════════════════════════════════════

def lambda_handler(event, context):
    """
    AWS Lambda entry point — triggered by S3 ObjectCreated event.

    Args:
        event:   S3 event payload.
        context: Lambda runtime context.

    Returns:
        dict with processing results.
    """
    logger.info("Received event: %s", json.dumps(event, default=str))

    # ── 1. Extract S3 Event Metadata ─────────────────────────────────────────
    try:
        record = event["Records"][0]["s3"]
        bucket = record["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["object"]["key"])
    except (KeyError, IndexError) as exc:
        logger.error("Malformed S3 event: %s", str(exc))
        return {"status": "Error", "message": "Invalid S3 event payload"}

    # Derive incident_id from the object key
    # Expected key format: complaints/<uuid>.jpg  (set by generate_upload_url)
    try:
        # Extract filename from path and remove extension to get UUID
        filename = key.split("/")[-1]            # e.g. "abc-123.jpg"
        incident_id = filename.rsplit(".", 1)[0]  # e.g. "abc-123"
    except (IndexError, ValueError):
        incident_id = key.replace("/", "_").rsplit(".", 1)[0]

    logger.info(
        "Processing — bucket=%s key=%s incident_id=%s",
        bucket, key, incident_id,
    )

    # ── 2. YOLO Inference ────────────────────────────────────────────────────
    yolo_result = call_yolo(bucket, key)
    category = yolo_result["category"]
    confidence = yolo_result["confidence"]

    # ── 3. Severity Calculation ──────────────────────────────────────────────
    severity = calculate_severity(category, confidence)

    # ── 4. Department Mapping ────────────────────────────────────────────────
    department = get_department(category)

    # ── 5. Generate Complaint Text (Bedrock) ─────────────────────────────────
    location = f"s3://{bucket}/{key}"
    complaint_text = generate_complaint_text(category, severity, location)

    # ── 6. Persist to DynamoDB ───────────────────────────────────────────────
    timestamp = datetime.now(timezone.utc).isoformat()

    complaint_record = {
        "incident_id": incident_id,
        "category":    category,
        "confidence":  str(confidence),  # DynamoDB-safe
        "severity":    severity,
        "department":  department,
        "description": complaint_text,
        "status":      "Pending",
        "timestamp":   timestamp,
        "s3_key":      key,
    }

    save_to_dynamodb(complaint_record)

    # ── 7. Email Notification ────────────────────────────────────────────────
    send_email_notification(
        incident_id=incident_id,
        department=department,
        category=category,
        severity=severity,
        complaint_text=complaint_text,
    )

    # ── 8. Return Result ─────────────────────────────────────────────────────
    result = {
        "status":      "Processed",
        "incident_id": incident_id,
        "category":    category,
        "severity":    severity,
        "department":  department,
    }

    logger.info("Lambda complete: %s", json.dumps(result))
    return result
