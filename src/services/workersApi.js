import { api } from './apiClient';
import { mockComplaints } from '../data/mockData';
import { getComplaints } from './complaintsApi';
import { normalizeComplaintList } from './complaintModel';

const ENABLE_MOCK_FALLBACK =
    import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true' || !import.meta.env.PROD;

function normalizeWorkerPhone(phone) {
    const raw = String(phone || '').trim();
    if (!raw) return '';
    if (raw.startsWith('+')) return raw;

    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    return raw;
}

function normalizeWorkerPhoneForMatch(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return digits;
}

function complaintMatchesWorkerPhone(complaint, workerPhone) {
    const workerNorm = normalizeWorkerPhoneForMatch(workerPhone);
    if (!workerNorm) return false;

    const candidates = [
        complaint.assigned_to,
        complaint.assignedTo,
        complaint.worker_phone,
        complaint.workerPhone,
    ];

    return candidates.some((value) => normalizeWorkerPhoneForMatch(value) === workerNorm);
}

function buildDerivedWorkersFromComplaints(complaints = []) {
    const byPhone = new Map();

    complaints.forEach((c) => {
        const phone = normalizeWorkerPhone(c.assigned_to || c.assignedTo || '');
        if (!phone) return;

        const name = (c.assigned_to_name || c.assignedToName || '').trim() || `Worker ${phone.slice(-4)}`;
        const existing = byPhone.get(phone);
        if (existing) {
            if ((c.timestamp || c.createdAt || '') > (existing.created_at || '')) {
                existing.created_at = c.timestamp || c.createdAt || existing.created_at;
            }
            return;
        }

        byPhone.set(phone, {
            phone,
            name,
            department: c.department || 'General',
            created_at: c.timestamp || c.createdAt || '',
            source: 'complaints',
        });
    });

    return [...byPhone.values()];
}

function mergeWorkers(primary = [], secondary = []) {
    const merged = new Map();

    [...primary, ...secondary].forEach((worker) => {
        const phone = normalizeWorkerPhone(worker.phone);
        if (!phone) return;

        const existing = merged.get(phone);
        const normalized = {
            ...worker,
            phone,
            name: worker.name || existing?.name || `Worker ${phone.slice(-4)}`,
            department: worker.department || existing?.department || 'General',
            created_at: worker.created_at || existing?.created_at || '',
        };

        merged.set(phone, normalized);
    });

    return [...merged.values()].sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
}

export async function getWorkers() {
    try {
        const [workerRes, complaintsRes] = await Promise.all([
            api.get('/workers'),
            getComplaints().catch(() => ({ complaints: [] })),
        ]);

        const apiWorkers = workerRes.workers || [];
        const derivedWorkers = buildDerivedWorkersFromComplaints(complaintsRes.complaints || []);

        return {
            ...workerRes,
            success: workerRes.success !== false,
            workers: mergeWorkers(apiWorkers, derivedWorkers),
        };
    } catch (err) {
        console.error('API Error in getWorkers:', err.message);
        if (ENABLE_MOCK_FALLBACK) {
            const derivedWorkers = buildDerivedWorkersFromComplaints(normalizeComplaintList(mockComplaints));
            return { success: true, workers: derivedWorkers };
        }
        throw err;
    }
}

export async function addWorker(workerData) {
    try {
        return await api.post('/workers', workerData);
    } catch (err) {
        console.error('API Error in addWorker:', err.message);
        throw err;
    }
}

export async function removeWorker(phone) {
    try {
        return await api.delete(`/workers/${encodeURIComponent(phone)}`);
    } catch (err) {
        console.error('API Error in removeWorker:', err.message);
        throw err;
    }
}

export async function getWorkerStats(workerPhone) {
    try {
        const res = await getComplaints();
        const all = res.complaints || [];
        const mine = all.filter((c) => complaintMatchesWorkerPhone(c, workerPhone));

        const resolved = mine.filter((c) => ['resolved', 'closed'].includes(c.status));
        const active = mine.filter((c) => c.status === 'in_progress');
        const pending = mine.filter((c) => c.status === 'assigned');
        const rejected = mine.filter((c) => c.worker_action === 'rejected');

        const times = resolved
            .map((c) => {
                const start = new Date(c.assigned_at || c.timestamp).getTime();
                const end = new Date(c.resolvedAt || c.updatedAt || c.timestamp).getTime();
                return end > start ? (end - start) / 3600000 : 0;
            })
            .filter((h) => h > 0);
        const avgHours = times.length
            ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)
            : null;

        const withinSla = resolved.filter((c) => {
            if (!c.sla_deadline || !c.resolvedAt) return true;
            return new Date(c.resolvedAt) <= new Date(c.sla_deadline);
        });
        const slaRate = resolved.length
            ? Math.round((withinSla.length / resolved.length) * 100)
            : 100;

        return {
            success: true,
            total: mine.length,
            resolved: resolved.length,
            active: active.length,
            pending: pending.length,
            rejected: rejected.length,
            avgResolutionHours: avgHours,
            slaComplianceRate: slaRate,
            recentResolved: resolved.slice(0, 5),
        };
    } catch (err) {
        console.warn('Worker stats failed:', err.message);
        if (ENABLE_MOCK_FALLBACK) {
            return {
                success: true,
                total: 0,
                resolved: 0,
                active: 0,
                pending: 0,
                rejected: 0,
                avgResolutionHours: null,
                slaComplianceRate: 100,
                recentResolved: [],
            };
        }
        throw err;
    }
}
