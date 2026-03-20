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

export function normalizeComplaint(raw = {}) {
    const incidentId = raw.incident_id || raw.id || '';
    const category = String(raw.category || '').toLowerCase() || 'road_issue';
    const priorityScore = parseNumber(raw.priorityScore) ?? 0;
    const confidence = parseNumber(raw.confidence) ?? 0;
    const latitude = parseNumber(raw.latitude);
    const longitude = parseNumber(raw.longitude);

    return {
        ...raw,
        incident_id: incidentId,
        id: incidentId,
        category,
        subCategory: raw.subCategory || raw.sub_category || category,
        severity: String(raw.severity || 'medium').toLowerCase(),
        status: normalizeStatus(raw.status),
        description: raw.description || raw.aiDescription || '',
        aiDescription: raw.aiDescription || raw.description || '',
        department: raw.department || '',
        priorityScore,
        confidence,
        address: raw.address || '',
        latitude,
        longitude,
        upvotes: parseNumber(raw.upvotes) ?? 0,
        timestamp: raw.timestamp || raw.createdAt || raw.created_at || null,
        createdAt: raw.createdAt || raw.created_at || raw.timestamp || null,
        resolvedAt: raw.resolvedAt || raw.resolved_at || null,
        user_name: raw.user_name || raw.userName || '',
        user_phone: raw.user_phone || raw.userPhone || raw.phone || '',
        user_note: raw.user_note || raw.userNote || '',
        assignedTo: raw.assignedTo || raw.assigned_to || '',
        s3_key: raw.s3_key || raw.s3Key || '',
        images: Array.isArray(raw.images) ? raw.images : [],
        statusHistory: Array.isArray(raw.statusHistory) ? raw.statusHistory : [],
    };
}

export function normalizeComplaintList(items = []) {
    return items.map(normalizeComplaint);
}
