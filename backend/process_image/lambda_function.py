import json
import logging
import urllib.parse
from datetime import datetime, timezone

from config import TABLE_NAME, SES_SOURCE_EMAIL, SMS_NOTIFICATIONS_ENABLED
from aws_utils import dynamodb_resource, ses_client, sns_client
from inference_client import call_yolo
from vision_fallback import classify_with_nova
from severity_rules import calculate_severity
from department_mapper import get_department
from prompt_builder import generate_complaint_text
from priority_calculator import calculate_priority

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def save_to_dynamodb(item: dict) -> None:
    try:
        table = dynamodb_resource.Table(TABLE_NAME)
        table.put_item(Item=item)
        logger.info("Saved complaint %s to DynamoDB", item.get("incident_id"))
    except Exception as exc:
        logger.error("DynamoDB put_item failed for %s: %s", item.get("incident_id"), str(exc))


def send_email_notification(incident_id, department, category, severity, complaint_text):
    if not SES_SOURCE_EMAIL:
        logger.info("SES_SOURCE_EMAIL is not configured; skipping email notification for %s", incident_id)
        return

    subject = f"New Civic Complaint - {incident_id}"

    body = (
        f"A new civic complaint has been filed.\n\n"
        f"Complaint ID : {incident_id}\n"
        f"Category     : {category}\n"
        f"Severity     : {severity}\n"
        f"Department   : {department}\n\n"
        f"Description:\n{complaint_text}\n\n"
        f"Please take appropriate action.\n"
    )

    try:
        ses_client.send_email(
            Source=SES_SOURCE_EMAIL,
            Destination={"ToAddresses": [SES_SOURCE_EMAIL]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            },
        )
        logger.info("Email notification sent for %s", incident_id)
    except Exception as exc:
        logger.error("SES send_email failed for %s: %s", incident_id, str(exc))


def normalize_phone_number(raw_phone: str) -> str | None:
    if not raw_phone:
        return None

    cleaned = "".join(ch for ch in str(raw_phone) if ch.isdigit() or ch == "+")
    if cleaned.startswith("+"):
        return cleaned

    digits = "".join(ch for ch in cleaned if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return None


def send_sms_notification(incident_id, department, category, severity, complaint_text, user_phone):
    if not SMS_NOTIFICATIONS_ENABLED:
        logger.info("SMS notifications disabled; skipping SMS for %s", incident_id)
        return

    phone_number = normalize_phone_number(user_phone)
    if not phone_number:
        logger.info("No valid phone number available; skipping SMS for %s", incident_id)
        return

    message = (
        f"JanSevaAI Update\n"
        f"Complaint ID: {incident_id}\n"
        f"Category: {category}\n"
        f"Severity: {severity}\n"
        f"Dept: {department}\n"
        f"Status: submitted\n"
        f"Details: {complaint_text[:240]}"
    )

    try:
        sns_client.publish(PhoneNumber=phone_number, Message=message)
        logger.info("SMS notification sent for %s to %s", incident_id, phone_number)
    except Exception as exc:
        logger.error("SNS publish failed for %s: %s", incident_id, str(exc))


def lambda_handler(event, context):
    logger.info("Received event: %s", json.dumps(event, default=str))

    # 1. extract S3 event metadata
    try:
        record = event["Records"][0]["s3"]
        bucket = record["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["object"]["key"])
    except (KeyError, IndexError) as exc:
        logger.error("Malformed S3 event: %s", str(exc))
        return {"status": "Error", "message": "Invalid S3 event payload"}

    # extract incident_id and image index from key
    filename = key.split("/")[-1]
    name_part = filename.rsplit(".", 1)[0]

    if "_" in name_part:
        parts = name_part.rsplit("_", 1)
        incident_id = parts[0]
        image_index = parts[1]
    else:
        incident_id = name_part
        image_index = "1"

    # only process the primary image, skip secondary ones
    if image_index != "1":
        logger.info("Skipping secondary image %s (index=%s)", key, image_index)
        return {"status": "Skipped", "reason": "secondary image"}

    logger.info("Processing primary image — bucket=%s key=%s incident_id=%s", bucket, key, incident_id)

    # 1.b Pre-fetch existing DynamoDB record early to extract address and timestamp
    latitude = None
    longitude = None
    address = None
    existing = {}
    timestamp = datetime.now(timezone.utc).isoformat()
    db_timestamp = timestamp
    
    try:
        table = dynamodb_resource.Table(TABLE_NAME)
        existing = table.get_item(Key={"incident_id": incident_id}).get("Item", {})
        latitude = float(existing.get("latitude", 0)) or None
        longitude = float(existing.get("longitude", 0)) or None
        address = existing.get("address")
        db_timestamp = existing.get("timestamp", timestamp)
    except Exception:
        pass

    # 2. YOLO inference
    yolo_result = call_yolo(bucket, key)
    category = yolo_result["category"]
    confidence = yolo_result["confidence"]

    # 2b. vision fallback when YOLO returns Unknown
    if category == "Unknown" or confidence == 0.0:
        logger.info("YOLO returned Unknown, falling back to Amazon Nova Vision")
        fallback_result = classify_with_nova(bucket, key)
        if fallback_result["category"] != "Unknown":
            category = fallback_result["category"]
            confidence = fallback_result["confidence"]
            logger.info("Nova fallback succeeded — category=%s confidence=%.2f", category, confidence)

    # 3. severity calculation
    severity = calculate_severity(category, confidence)

    # 4. department mapping
    department = get_department(category)

    # 5. generate complaint text via bedrock (NOW WITH ADDRESS)
    location = f"s3://{bucket}/{key}"
    complaint_text = generate_complaint_text(category, severity, location, address)

    # 5b. priority score (NOW WITH ADDRESS & TIMESTAMP)
    priority_score = calculate_priority(
        category=category,
        severity=severity,
        confidence=confidence,
        latitude=latitude,
        longitude=longitude,
        address=address,
        timestamp_str=db_timestamp,
        table_name=TABLE_NAME,
    )

    # 6. persist to dynamodb
    complaint_record = {
        "incident_id": incident_id,
        "category": category,
        "confidence": str(confidence),
        "severity": severity,
        "department": department,
        "description": complaint_text,
        "status": "submitted",
        "timestamp": db_timestamp,
        "s3_key": key,
        "priorityScore": priority_score,
    }

    if latitude:
        complaint_record["latitude"] = str(latitude)
    if longitude:
        complaint_record["longitude"] = str(longitude)
    for field in ["user_name", "user_phone", "address", "user_note"]:
        val = existing.get(field)
        if val:
            complaint_record[field] = val

    save_to_dynamodb(complaint_record)

    # 7. email notification
    send_email_notification(
        incident_id=incident_id,
        department=department,
        category=category,
        severity=severity,
        complaint_text=complaint_text,
    )

    send_sms_notification(
        incident_id=incident_id,
        department=department,
        category=category,
        severity=severity,
        complaint_text=complaint_text,
        user_phone=existing.get("user_phone"),
    )

    # 8. return result
    result = {
        "status": "Processed",
        "incident_id": incident_id,
        "category": category,
        "severity": severity,
        "department": department,
        "priorityScore": priority_score,
    }

    logger.info("Lambda complete: %s", json.dumps(result))
    return result
