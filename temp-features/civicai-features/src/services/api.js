import { api, uploadToS3 } from './apiClient';
import { mockComplaints, mockDashboardStats } from '../data/mockData';
import {
    normalizeComplaint,
    normalizeComplaintList,
    normalizeStatus,
} from './complaintModel';

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function login(phone) {
    try {
        return await api.post('/auth/send-otp', { phone });
    } catch (err) {
        console.error('API Error in login:', err.message);
        throw err;
    }
}

export async function verifyOtp(phone, otp, role = 'citizen') {
    try {
        const res = await api.post('/auth/verify-otp', { phone, otp, role });
        if (res.token) {
            localStorage.setItem('civicai_token', res.token);
        }
        return res;
    } catch (err) {
        console.error('API Error in verifyOtp:', err.message);
        throw err;
    }
}

// ─── Complaints (read) ───────────────────────────────────────────────────────

export async function getComplaints(filters = {}) {
    try {
        const res = await api.get('/complaints', filters);
        const complaints = normalizeComplaintList(res.complaints || []);
        return {
            ...res,
            complaints,
            total: res.total ?? complaints.length,
            pagination: res.pagination ?? {
                page: 1, limit: complaints.length,
                total: complaints.length, pages: 1,
            },
        };
    } catch (err) {
        console.warn('API unreachable, using mock complaints:', err.message);
        let results = normalizeComplaintList(mockComplaints);
        if (filters.status) results = results.filter(c => c.status === normalizeStatus(filters.status));
        if (filters.category) {
            const mappedCats = {
                road_issue: ['road_issue', 'pothole'],
                waste:      ['waste', 'garbage'],
                lighting:   ['lighting', 'streetlight', 'broken_streetlight'],
            };
            const validCats = mappedCats[filters.category] || [filters.category];
            results = results.filter(c => validCats.includes(c.category));
        }
        if (filters.severity) results = results.filter(c => c.severity === filters.severity);
        return {
            success: true, complaints: results, total: results.length,
            pagination: { page: 1, limit: 20, total: results.length, pages: 1 },
        };
    }
}

export async function getComplaintById(id) {
    try {
        const res = await api.get(`/complaints/${id}`);
        return { success: true, complaint: normalizeComplaint(res.complaint || res) };
    } catch (err) {
        console.warn('API unreachable, using mock complaint:', err.message);
        const complaint = normalizeComplaintList(mockComplaints).find(c => c.incident_id === id);
        if (!complaint) return { success: false, error: 'Complaint not found' };
        return { success: true, complaint };
    }
}

export async function getNearbyComplaints(lat, lng, radius = 500) {
    try {
        const res = await api.get('/complaints/nearby', { lat, lng, radius });
        return { ...res, complaints: normalizeComplaintList(res.complaints || []) };
    } catch (err) {
        console.warn('API unreachable, using mock nearby complaints:', err.message);
        return { success: true, complaints: normalizeComplaintList(mockComplaints.slice(0, 5)), total: 5 };
    }
}

export async function upvoteComplaint(id) {
    try {
        return await api.post(`/complaints/${id}/upvote`);
    } catch (err) {
        console.warn('API unreachable, using mock upvote:', err.message);
        return { success: true, upvotes: 24, newPriorityScore: 86 };
    }
}

// ─── Complaints (write) ──────────────────────────────────────────────────────

export async function submitComplaint(data) {
    try {
        return await api.post('/complaints', {
            category:      data.analysis?.category,
            subCategory:   data.analysis?.subCategory,
            severity:      data.analysis?.severity,
            confidence:    data.analysis?.confidence,
            description:   data.analysis?.description,
            department:    data.analysis?.department,
            priorityScore: data.analysis?.priorityScore,
            userNote:      data.userNote,
            userName:      data.userName,
            userPhone:     data.userPhone,
            s3Key:         data.s3Keys?.[0] || data.s3Key,
            s3Keys:        data.s3Keys || (data.s3Key ? [data.s3Key] : []),
            latitude:      data.latitude,
            longitude:     data.longitude,
            address:       data.address,
        });
    } catch (err) {
        console.error('API Error in submitComplaint:', err.message);
        throw err;
    }
}

export async function updateComplaintStatus(id, status, notes) {
    try {
        const res = await api.patch(`/complaints/${id}/status`, {
            status: normalizeStatus(status),
            notes,
        });
        return {
            ...res,
            updatedRecord: res.updatedRecord ? normalizeComplaint(res.updatedRecord) : null,
        };
    } catch (err) {
        const safeStatus = normalizeStatus(status);
        console.warn('API unreachable, using mock status update:', err.message);
        return {
            success: true,
            message: `Complaint ${id} updated to ${safeStatus}`,
            updatedRecord: normalizeComplaint({ incident_id: id, status: safeStatus }),
        };
    }
}

// ─── NEW: Assign complaint to a worker ───────────────────────────────────────

export async function assignComplaint(incidentId, workerPhone, workerName, note = '') {
    try {
        return await api.post(`/complaints/${incidentId}/assign`, {
            workerPhone,
            workerName,
            note,
        });
    } catch (err) {
        console.warn('Assign API unreachable, mock response:', err.message);
        return {
            success:      true,
            incident_id:  incidentId,
            assigned_to:  workerPhone,
            sla_deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        };
    }
}

// ─── NEW: Bulk update multiple complaints ─────────────────────────────────────

export async function bulkUpdateComplaints({ incidentIds, action, status, workerPhone, workerName, note }) {
    try {
        return await api.post('/complaints/bulk', {
            incidentIds,
            action,
            status,
            workerPhone,
            workerName,
            note,
        });
    } catch (err) {
        console.warn('Bulk update API unreachable, mock response:', err.message);
        return {
            success:       true,
            updated_count: incidentIds.length,
            failed_count:  0,
            results:       { updated: incidentIds, failed: [] },
        };
    }
}

// ─── NEW: Worker accept / reject a task ──────────────────────────────────────

export async function workerRespondToTask(incidentId, action, note = '') {
    // action: 'accepted' | 'rejected'
    const newStatus = action === 'accepted' ? 'in_progress' : 'submitted';
    try {
        return await api.patch(`/complaints/${incidentId}/status`, {
            status:       newStatus,
            workerAction: action,
            notes:        note,
        });
    } catch (err) {
        console.warn('Worker respond API unreachable, mock response:', err.message);
        return { success: true, incident_id: incidentId, status: newStatus };
    }
}

// ─── NEW: Upload resolution photo proof and resolve ──────────────────────────

export async function resolveWithProof(incidentId, proofFile, note = '') {
    try {
        // Get a presigned URL for the proof photo
        const presign = await getUploadUrl(
            `proof_${proofFile.name}`,
            proofFile.type,
            incidentId,
            99   // imageIndex 99 = resolution proof convention
        );
        if (!presign?.upload_url) {
            throw new Error('Could not get upload URL for proof photo');
        }

        await uploadToS3(presign.upload_url, proofFile);

        // Now resolve with the proof S3 key attached
        const res = await api.patch(`/complaints/${incidentId}/status`, {
            status:     'resolved',
            proofS3Key: presign.s3_key,
            notes:      note || 'Resolved with photo proof',
        });
        return { ...res, proofS3Key: presign.s3_key };
    } catch (err) {
        console.warn('Resolve with proof failed, falling back to simple resolve:', err.message);
        return await updateComplaintStatus(incidentId, 'resolved', note);
    }
}

// ─── NEW: Get SLA breach data for admin dashboard ────────────────────────────
// Computed client-side from complaints list — no extra Lambda needed

export async function getSlaBreaches() {
    try {
        const res = await getComplaints();
        const now = Date.now();
        const complaints = res.complaints || [];

        const breached = complaints.filter(c => {
            if (['resolved', 'closed'].includes(c.status)) return false;
            if (!c.sla_deadline) return false;
            return new Date(c.sla_deadline).getTime() < now;
        }).map(c => ({
            ...c,
            hoursOverdue: Math.round((now - new Date(c.sla_deadline).getTime()) / 3600000),
        })).sort((a, b) => b.hoursOverdue - a.hoursOverdue);

        const warning = complaints.filter(c => {
            if (['resolved', 'closed'].includes(c.status)) return false;
            if (!c.sla_deadline) return false;
            const msLeft = new Date(c.sla_deadline).getTime() - now;
            return msLeft > 0 && msLeft < 6 * 3600 * 1000; // within 6 hours
        });

        return { success: true, breached, warning, total: complaints.length };
    } catch (err) {
        console.warn('SLA data failed:', err.message);
        return { success: true, breached: [], warning: [], total: 0 };
    }
}

// ─── NEW: Worker personal stats ──────────────────────────────────────────────

export async function getWorkerStats(workerPhone) {
    try {
        const res = await getComplaints();
        const all  = res.complaints || [];
        const mine = all.filter(c => c.assigned_to === workerPhone);

        const resolved  = mine.filter(c => ['resolved', 'closed'].includes(c.status));
        const active    = mine.filter(c => c.status === 'in_progress');
        const pending   = mine.filter(c => c.status === 'assigned');
        const rejected  = mine.filter(c => c.worker_action === 'rejected');

        // Avg resolution time in hours
        const times = resolved
            .map(c => {
                const start = new Date(c.assigned_at || c.timestamp).getTime();
                const end   = new Date(c.resolvedAt || c.updatedAt || c.timestamp).getTime();
                return end > start ? (end - start) / 3600000 : 0;
            })
            .filter(h => h > 0);
        const avgHours = times.length
            ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)
            : null;

        // SLA compliance: resolved within deadline
        const withinSla = resolved.filter(c => {
            if (!c.sla_deadline || !c.resolvedAt) return true;
            return new Date(c.resolvedAt) <= new Date(c.sla_deadline);
        });
        const slaRate = resolved.length
            ? Math.round((withinSla.length / resolved.length) * 100)
            : 100;

        return {
            success:        true,
            total:          mine.length,
            resolved:       resolved.length,
            active:         active.length,
            pending:        pending.length,
            rejected:       rejected.length,
            avgResolutionHours: avgHours,
            slaComplianceRate:  slaRate,
            recentResolved: resolved.slice(0, 5),
        };
    } catch (err) {
        console.warn('Worker stats failed:', err.message);
        return {
            success: true, total: 0, resolved: 0, active: 0,
            pending: 0, rejected: 0, avgResolutionHours: null, slaComplianceRate: 100,
            recentResolved: [],
        };
    }
}

// ─── Image upload helpers ────────────────────────────────────────────────────

export async function getUploadUrl(fileName, fileType, incidentId = null, imageIndex = 1) {
    try {
        const payload = { fileName, fileType, imageIndex };
        if (incidentId) payload.incidentId = incidentId;
        return await api.post('/upload/presign', payload);
    } catch (err) {
        console.warn('API unreachable, no presigned URL available:', err.message);
        return null;
    }
}

export async function analyzeImages(imageFiles) {
    try {
        const primary        = imageFiles[0];
        const primaryPresign = await getUploadUrl(primary.name, primary.type);
        if (!primaryPresign?.upload_url) throw new Error('Could not get upload URL');

        const incidentId = primaryPresign.incident_id;
        const s3Keys     = [primaryPresign.s3_key];

        await uploadToS3(primaryPresign.upload_url, primary);

        const secondaryFiles = imageFiles.slice(1);
        if (secondaryFiles.length > 0) {
            const keys = await Promise.all(
                secondaryFiles.map(async (file, i) => {
                    const presign = await getUploadUrl(file.name, file.type, incidentId, i + 2);
                    if (presign?.upload_url) {
                        await uploadToS3(presign.upload_url, file);
                        return presign.s3_key;
                    }
                    return null;
                })
            );
            s3Keys.push(...keys.filter(Boolean));
        }

        const result = await pollForResult(incidentId);
        if (!result) throw new Error('Processing timed out');

        return _buildAnalysisResult(result, s3Keys, incidentId);
    } catch (err) {
        console.warn('Multi-image analysis failed, using mock:', err.message);
        return _mockAnalysisResult();
    }
}

export async function analyzeImage(imageFile) {
    try {
        const presign = await getUploadUrl(imageFile.name, imageFile.type);
        if (!presign?.upload_url) throw new Error('Could not get upload URL');
        await uploadToS3(presign.upload_url, imageFile);
        const result = await pollForResult(presign.incident_id);
        if (!result) throw new Error('Processing timed out');
        return _buildAnalysisResult(result, [presign.s3_key], presign.incident_id);
    } catch (err) {
        console.warn('Image analysis API failed, using mock:', err.message);
        return _mockAnalysisResult();
    }
}

async function pollForResult(incidentId) {
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const res  = await api.get(`/complaints/${incidentId}`);
            const item = res?.complaint || res || {};
            if (item?.incident_id && item?.severity) return normalizeComplaint(item);
        } catch { /* keep polling */ }
    }
    return null;
}

function _buildAnalysisResult(result, s3Keys, incidentId) {
    let category    = result.category;
    let subCategory = result.category;
    if (!category || category.toLowerCase() === 'unknown') {
        const dept = (result.department || '').toLowerCase();
        if (dept.includes('road'))       { category = 'road_issue'; subCategory = 'pothole'; }
        else if (dept.includes('sanit')) { category = 'waste';      subCategory = 'garbage_accumulation'; }
        else if (dept.includes('elect')) { category = 'lighting';   subCategory = 'broken_streetlight'; }
        else if (dept.includes('water')) { category = 'water';      subCategory = 'pipe_leakage'; }
    }
    return {
        success: true,
        analysis: {
            category:               category || 'road_issue',
            subCategory:            subCategory || 'pothole',
            severity:               result.severity || 'medium',
            confidence:             Number(result.confidence) || 0.85,
            description:            result.description || '',
            priorityScore:          Number(result.priorityScore) || 70,
            department:             result.department || 'PWD',
            estimatedResolutionTime: result.estimatedResolutionTime || '2-3 days',
            suggestedActions:       result.suggestedActions || [
                'Inspect the reported area',
                'Assign to nearest field worker',
                'Schedule repair within SLA',
            ],
        },
        s3Keys,
        incidentId,
    };
}

function _mockAnalysisResult() {
    return {
        success: true,
        analysis: {
            category:               'road_issue',
            subCategory:            'pothole',
            severity:               'high',
            confidence:             0.92,
            description:            'Large pothole detected on main road causing traffic disruption. Immediate repair recommended.',
            priorityScore:          78,
            department:             'PWD',
            estimatedResolutionTime: '2-3 days',
            suggestedActions:       [
                'Fill pothole with asphalt',
                'Place warning cones around area',
                'Divert traffic if needed',
            ],
        },
        s3Keys: [],
    };
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export async function getDashboardStats() {
    try {
        const res        = await getComplaints();
        const complaints = res.complaints || [];
        return { success: true, stats: computeStats(complaints) };
    } catch (err) {
        console.warn('Stats computation failed, using mock:', err.message);
        return { success: true, stats: mockDashboardStats };
    }
}

function computeStats(complaints) {
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const total       = complaints.length;
    const active      = complaints.filter(c => ['submitted', 'assigned', 'in_progress'].includes(c.status)).length;
    const resolvedAll = complaints.filter(c => ['resolved', 'closed'].includes(c.status));
    const resolvedToday = resolvedAll.filter(c => {
        const d = new Date(c.resolvedAt || c.updatedAt || c.timestamp);
        return d >= todayStart;
    }).length;
    const pending = complaints.filter(c => c.status === 'submitted').length;

    const resolutionRate = total > 0 ? Math.round((resolvedAll.length / total) * 100) : 0;

    const responseTimes = resolvedAll
        .map(c => {
            const start = new Date(c.timestamp || c.createdAt).getTime();
            const end   = new Date(c.resolvedAt || c.updatedAt || c.timestamp).getTime();
            return end > start ? (end - start) / (1000 * 60 * 60 * 24) : 0;
        })
        .filter(d => d > 0);
    const avgDays = responseTimes.length
        ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
        : '0';
    const avgResponseTime = `${avgDays} days`;

    const withinSLA    = responseTimes.filter(d => d <= 7).length;
    const slaAdherence = responseTimes.length
        ? Math.round((withinSLA / responseTimes.length) * 100) : 100;

    const catCounts = {};
    const catColors = {
        road_issue: '#EF4444', pothole: '#EF4444', waste: '#F59E0B', garbage: '#F59E0B',
        water: '#3B82F6', lighting: '#A855F7', streetlight: '#A855F7',
    };
    complaints.forEach(c => {
        const cat = c.category || 'unknown';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(catCounts).map(([name, value]) => ({
        name:  name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value,
        color: catColors[name] || '#64748B',
    }));

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
        const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        monthlyMap[key] = { month: key, complaints: 0, resolved: 0 };
    }
    complaints.forEach(c => {
        const d   = new Date(c.timestamp || c.createdAt);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
        if (monthlyMap[key]) {
            monthlyMap[key].complaints += 1;
            if (['resolved', 'closed'].includes(c.status)) monthlyMap[key].resolved += 1;
        }
    });
    const monthlyTrends = Object.values(monthlyMap);

    const deptMap = {};
    complaints.forEach(c => {
        const dept = c.department || 'General';
        if (!deptMap[dept]) deptMap[dept] = { dept, resolved: 0, pending: 0 };
        if (['resolved', 'closed'].includes(c.status)) deptMap[dept].resolved += 1;
        else deptMap[dept].pending += 1;
    });
    const departmentPerformance = Object.values(deptMap)
        .sort((a, b) => (b.resolved + b.pending) - (a.resolved + a.pending));

    const locCounts = {};
    complaints.forEach(c => {
        if (c.address) {
            const locality = c.address.split(',')[0].trim();
            locCounts[locality] = (locCounts[locality] || 0) + 1;
        }
    });
    const topHotspot = Object.entries(locCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // NEW: SLA breach count for dashboard
    const nowMs   = Date.now();
    const slaBreached = complaints.filter(c => {
        if (['resolved', 'closed'].includes(c.status)) return false;
        if (!c.sla_deadline) return false;
        return new Date(c.sla_deadline).getTime() < nowMs;
    }).length;

    return {
        totalComplaints: total,
        activeComplaints: active,
        resolvedToday,
        pendingTriage: pending,
        resolutionRate,
        avgResponseTime,
        slaAdherence,
        topHotspot,
        categoryBreakdown,
        monthlyTrends,
        departmentPerformance,
        slaBreached,           // NEW
    };
}

export async function getWorkerAssignments() {
    try {
        const res = await api.get('/worker/assignments');
        return { ...res, assignments: normalizeComplaintList(res.assignments || []) };
    } catch (err) {
        console.warn('API unreachable, using mock worker assignments:', err.message);
        const assignments = normalizeComplaintList(mockComplaints).filter(
            c => c.status === 'assigned' || c.status === 'in_progress'
        );
        return { success: true, assignments };
    }
}
