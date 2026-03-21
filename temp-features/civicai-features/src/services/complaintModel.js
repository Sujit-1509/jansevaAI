export const COMPLAINT_STATUSES = ['submitted', 'assigned', 'in_progress', 'resolved', 'closed'];

export function normalizeStatus(status) {
    const safeStatus = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');

    if (!safeStatus || safeStatus === 'pending') {
        return 'submitted';
    }

    if (safeStatus === 'in-progress') {
        return 'in_progress';
    }

    return COMPLAINT_STATUSES.includes(safeStatus) ? safeStatus : 'submitted';
}

function parseNumber(value) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalize a raw DynamoDB complaint record into the consistent shape
 * the frontend always works with.
 *
 * New fields added in this version:
 *   assigned_to          — worker phone (string)
 *   assigned_to_name     — worker display name (string)
 *   assigned_at          — ISO timestamp of assignment (string | null)
 *   sla_deadline         — ISO timestamp of SLA deadline (string | null)
 *   status_history       — array of {status, timestamp, actor, note, proof_s3_key?}
 *   worker_action        — "accepted" | "rejected" | "" (string)
 *   resolution_proof_key — S3 key of resolution photo (string)
 */
export function normalizeComplaint(raw = {}) {
    const incidentId  = raw.incident_id || raw.id || '';
    const category    = String(raw.category || '').toLowerCase() || 'road_issue';
    const priorityScore = parseNumber(raw.priorityScore) ?? 0;
    const confidence    = parseNumber(raw.confidence) ?? 0;
    const latitude      = parseNumber(raw.latitude);
    const longitude     = parseNumber(raw.longitude);

    // Normalise status_history — DynamoDB returns it as a List of Maps.
    // Accept either camelCase (statusHistory) or snake_case (status_history).
    const rawHistory = raw.status_history || raw.statusHistory;
    const statusHistory = Array.isArray(rawHistory)
        ? rawHistory.map(entry => ({
              status:        entry.status || entry.worker_action || 'updated',
              timestamp:     entry.timestamp || null,
              actor:         entry.actor || '',
              note:          entry.note || '',
              worker_action: entry.worker_action || '',
              proof_s3_key:  entry.proof_s3_key || entry.proofS3Key || '',
          }))
        : [];

    return {
        ...raw,

        // ── Identity ──────────────────────────────────────────────────────
        incident_id: incidentId,
        id:          incidentId,

        // ── Classification ────────────────────────────────────────────────
        category,
        subCategory: raw.subCategory || raw.sub_category || category,
        severity:    String(raw.severity || 'medium').toLowerCase(),
        status:      normalizeStatus(raw.status),
        department:  raw.department || '',

        // ── AI output ────────────────────────────────────────────────────
        description:   raw.description || raw.aiDescription || '',
        aiDescription: raw.aiDescription || raw.description || '',
        priorityScore,
        confidence,

        // ── Location ─────────────────────────────────────────────────────
        address:   raw.address || '',
        latitude,
        longitude,

        // ── Timestamps ───────────────────────────────────────────────────
        timestamp:  raw.timestamp  || raw.createdAt  || raw.created_at  || null,
        createdAt:  raw.createdAt  || raw.created_at || raw.timestamp   || null,
        resolvedAt: raw.resolvedAt || raw.resolved_at || null,

        // ── User ─────────────────────────────────────────────────────────
        user_name:  raw.user_name  || raw.userName  || '',
        user_phone: raw.user_phone || raw.userPhone || raw.phone || '',
        user_note:  raw.user_note  || raw.userNote  || '',
        upvotes:    parseNumber(raw.upvotes) ?? 0,

        // ── Assignment (NEW) ──────────────────────────────────────────────
        assigned_to:      raw.assigned_to      || raw.assignedTo      || '',
        assigned_to_name: raw.assigned_to_name || raw.assignedToName  || '',
        assigned_at:      raw.assigned_at      || raw.assignedAt      || null,

        // ── SLA (NEW) ─────────────────────────────────────────────────────
        sla_deadline: raw.sla_deadline || raw.slaDeadline || null,

        // ── Worker response (NEW) ─────────────────────────────────────────
        worker_action: raw.worker_action || raw.workerAction || '',

        // ── Resolution proof (NEW) ────────────────────────────────────────
        resolution_proof_key: raw.resolution_proof_key || raw.resolutionProofKey || '',

        // ── Images & history ─────────────────────────────────────────────
        s3_key:        raw.s3_key  || raw.s3Key || '',
        images:        Array.isArray(raw.images) ? raw.images : [],
        status_history: statusHistory,

        // Keep legacy camelCase alias so any existing code doesn't break
        statusHistory,
        assignedTo: raw.assigned_to || raw.assignedTo || '',
    };
}

export function normalizeComplaintList(items = []) {
    return items.map(normalizeComplaint);
}
