import { api, uploadToS3 } from './apiClient';
import { mockComplaints } from '../data/mockData';
import {
    normalizeComplaint,
    normalizeComplaintList,
    normalizeStatus,
} from './complaintModel';

const ENABLE_MOCK_FALLBACK =
    import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true' || !import.meta.env.PROD;

export async function getComplaints(filters = {}) {
    try {
        const res = await api.get('/complaints', filters);
        const complaints = normalizeComplaintList(res.complaints || []);
        return {
            ...res,
            complaints,
            total: res.total ?? complaints.length,
            pagination: res.pagination ?? {
                page: 1,
                limit: complaints.length,
                total: complaints.length,
                pages: 1,
            },
        };
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) {
            console.error('API Error in getComplaints:', err.message);
            throw err;
        }
        console.warn('API unreachable, using mock complaints:', err.message);
        let results = normalizeComplaintList(mockComplaints);
        if (filters.status) results = results.filter((c) => c.status === normalizeStatus(filters.status));
        if (filters.category) {
            const mappedCats = {
                road_issue: ['road_issue', 'pothole'],
                waste: ['waste', 'garbage'],
                lighting: ['lighting', 'streetlight', 'broken_streetlight'],
            };
            const validCats = mappedCats[filters.category] || [filters.category];
            results = results.filter((c) => validCats.includes(c.category));
        }
        if (filters.severity) results = results.filter((c) => c.severity === filters.severity);
        return {
            success: true,
            complaints: results,
            total: results.length,
            pagination: { page: 1, limit: 20, total: results.length, pages: 1 },
        };
    }
}

export async function getComplaintById(id) {
    try {
        const res = await api.get(`/complaints/${id}`);
        return { success: true, complaint: normalizeComplaint(res.complaint || res) };
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) {
            console.error('API Error in getComplaintById:', err.message);
            throw err;
        }
        console.warn('API unreachable, using mock complaint:', err.message);
        const complaint = normalizeComplaintList(mockComplaints).find((c) => c.incident_id === id);
        if (!complaint) return { success: false, error: 'Complaint not found' };
        return { success: true, complaint };
    }
}

export async function getNearbyComplaints(lat, lng, radius = 500) {
    try {
        const res = await api.get('/complaints/nearby', { lat, lng, radius });
        return { ...res, complaints: normalizeComplaintList(res.complaints || []) };
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('API unreachable, using mock nearby complaints:', err.message);
        return { success: true, complaints: normalizeComplaintList(mockComplaints.slice(0, 5)), total: 5 };
    }
}

export async function upvoteComplaint(id) {
    try {
        return await api.post(`/complaints/${id}/upvote`);
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('API unreachable, using mock upvote:', err.message);
        return { success: true, upvotes: 24, newPriorityScore: 86 };
    }
}

export async function deleteComplaint(id) {
    try {
        return await api.delete(`/complaints/${id}`);
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('API unreachable, using mock delete:', err.message);
        return { success: true };
    }
}

export async function submitComplaint(data) {
    try {
        return await api.post('/complaints', {
            category: data.analysis?.category,
            subCategory: data.analysis?.subCategory,
            severity: data.analysis?.severity,
            confidence: data.analysis?.confidence,
            description: data.analysis?.description,
            department: data.analysis?.department,
            priorityScore: data.analysis?.priorityScore,
            userNote: data.userNote,
            userName: data.userName,
            userPhone: data.userPhone,
            s3Key: data.s3Keys?.[0] || data.s3Key,
            s3Keys: data.s3Keys || (data.s3Key ? [data.s3Key] : []),
            latitude: data.latitude,
            longitude: data.longitude,
            address: data.address,
        });
    } catch (err) {
        console.error('API Error in submitComplaint:', err.message);
        throw err;
    }
}

export async function updateComplaintStatus(id, status, notes, resolveLocation = null) {
    try {
        const body = {
            status: normalizeStatus(status),
            notes,
        };
        if (resolveLocation) body.resolveLocation = resolveLocation;
        const res = await api.patch(`/complaints/${id}/status`, body);
        return {
            ...res,
            updatedRecord: res.updatedRecord ? normalizeComplaint(res.updatedRecord) : null,
        };
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) {
            console.error('API Error in updateComplaintStatus:', err.message);
            throw err;
        }
        const safeStatus = normalizeStatus(status);
        console.warn('API unreachable, using mock status update:', err.message);
        return {
            success: true,
            message: `Complaint ${id} updated to ${safeStatus}`,
            updatedRecord: normalizeComplaint({ incident_id: id, status: safeStatus }),
        };
    }
}

export async function assignComplaint(incidentId, workerPhone, workerName, note = '') {
    try {
        return await api.post(`/complaints/${incidentId}/assign`, {
            workerPhone,
            workerName,
            note,
        });
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('Assign API failed, using mock assignment:', err.message);
        return {
            success: true,
            incident_id: incidentId,
            assigned_to: workerPhone,
            assigned_to_name: workerName,
            status: 'assigned',
        };
    }
}

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
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('Bulk update API failed, using mock response:', err.message);
        return {
            success: true,
            updated_count: incidentIds.length,
            failed_count: 0,
            results: {
                updated: incidentIds,
                failed: [],
            },
        };
    }
}

export async function workerRespondToTask(incidentId, action, note = '') {
    const newStatus = action === 'accepted' ? 'in_progress' : 'submitted';
    try {
        return await api.patch(`/complaints/${incidentId}/status`, {
            status: newStatus,
            workerAction: action,
            notes: note,
        });
    } catch (err) {
        if (!ENABLE_MOCK_FALLBACK) throw err;
        console.warn('Worker respond API unreachable, mock response:', err.message);
        return { success: true, incident_id: incidentId, status: newStatus };
    }
}

export async function resolveWithProof(incidentId, proofFile, note = '', resolveLocation = null) {
    try {
        const presign = await getUploadUrl(
            `proof_${proofFile.name}`,
            proofFile.type,
            incidentId,
            99
        );
        if (!presign?.upload_url) {
            throw new Error('Could not get upload URL for proof photo');
        }

        await uploadToS3(presign.upload_url, proofFile);

        const patchBody = {
            status: 'resolved',
            proofS3Key: presign.s3_key,
            notes: note || 'Resolved with photo proof',
        };
        if (resolveLocation) patchBody.resolveLocation = resolveLocation;
        const res = await api.patch(`/complaints/${incidentId}/status`, patchBody);
        return { ...res, proofS3Key: presign.s3_key };
    } catch (err) {
        console.warn('Resolve with proof failed, falling back to simple resolve:', err.message);
        return await updateComplaintStatus(incidentId, 'resolved', note, resolveLocation);
    }
}

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

export async function analyzeImages(imageFiles, onProgress) {
    try {
        const primary = imageFiles[0];
        const primaryPresign = await getUploadUrl(primary.name, primary.type);
        if (!primaryPresign?.upload_url) throw new Error('Could not get upload URL');

        const incidentId = primaryPresign.incident_id;
        const s3Keys = [primaryPresign.s3_key];

        await uploadToS3(primaryPresign.upload_url, primary);
        if (onProgress) onProgress('uploaded');

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

        const result = await pollForResult(incidentId, onProgress);
        if (!result) throw new Error('Processing timed out');

        return buildAnalysisResult(result, s3Keys, incidentId);
    } catch (err) {
        if (ENABLE_MOCK_FALLBACK) {
            console.warn('Multi-image analysis failed, using mock:', err.message);
            return mockAnalysisResult();
        }
        throw err;
    }
}

export async function analyzeImage(imageFile) {
    try {
        const presign = await getUploadUrl(imageFile.name, imageFile.type);
        if (!presign?.upload_url) throw new Error('Could not get upload URL');
        await uploadToS3(presign.upload_url, imageFile);
        const result = await pollForResult(presign.incident_id);
        if (!result) throw new Error('Processing timed out');
        return buildAnalysisResult(result, [presign.s3_key], presign.incident_id);
    } catch (err) {
        if (ENABLE_MOCK_FALLBACK) {
            console.warn('Image analysis API failed, using mock:', err.message);
            return mockAnalysisResult();
        }
        throw err;
    }
}

async function pollForResult(incidentId, onProgress) {
    for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (onProgress) {
            if (i >= 1) onProgress('detecting');
            if (i >= 3) onProgress('severity');
            if (i >= 6) onProgress('description');
        }
        try {
            const res = await api.get(`/complaints/${incidentId}`);
            const item = res?.complaint || res || {};
            // If backend flagged as invalid/spam, return immediately with that info
            if (item?.incident_id && (item?.status === 'invalid' || item?.is_spam)) {
                const normalized = normalizeComplaint(item);
                normalized._rejected = true;
                normalized._rejectionReason = item.rejection_reason || 'No civic issue detected in this image.';
                return normalized;
            }
            if (item?.incident_id && item?.severity) return normalizeComplaint(item);
        } catch {
            // keep polling
        }
    }
    return null;
}

function buildAnalysisResult(result, s3Keys, incidentId) {
    // If AI rejected the image (spam/no civic issue), bubble it up
    if (result._rejected) {
        return {
            success: false,
            rejected: true,
            rejectionReason: result._rejectionReason || 'No civic issue detected in this image.',
            incidentId,
        };
    }

    let category = result.category;
    let subCategory = result.category;
    if (!category || category.toLowerCase() === 'unknown') {
        const dept = (result.department || '').toLowerCase();
        if (dept.includes('road')) {
            category = 'road_issue';
            subCategory = 'pothole';
        } else if (dept.includes('sanit')) {
            category = 'waste';
            subCategory = 'garbage_accumulation';
        } else if (dept.includes('elect')) {
            category = 'lighting';
            subCategory = 'broken_streetlight';
        } else if (dept.includes('water')) {
            category = 'water';
            subCategory = 'pipe_leakage';
        }
    }
    return {
        success: true,
        analysis: {
            category: category || 'road_issue',
            subCategory: subCategory || 'pothole',
            severity: result.severity || 'medium',
            confidence: Number(result.confidence) || 0.85,
            description: result.description || '',
            priorityScore: Number(result.priorityScore) || 70,
            department: result.department || 'PWD',
            estimatedResolutionTime: result.estimatedResolutionTime || '2-3 days',
            suggestedActions: result.suggestedActions || [
                'Inspect the reported area',
                'Assign to nearest field worker',
                'Schedule repair within SLA',
            ],
        },
        s3Keys,
        incidentId,
    };
}

function mockAnalysisResult() {
    return {
        success: true,
        analysis: {
            category: 'road_issue',
            subCategory: 'pothole',
            severity: 'high',
            confidence: 0.92,
            description: 'Large pothole detected on main road causing traffic disruption. Immediate repair recommended.',
            priorityScore: 78,
            department: 'PWD',
            estimatedResolutionTime: '2-3 days',
            suggestedActions: [
                'Fill pothole with asphalt',
                'Place warning cones around area',
                'Divert traffic if needed',
            ],
        },
        s3Keys: [],
    };
}

/**
 * Submit citizen feedback for a resolved complaint.
 * The backend runs VADER sentiment analysis and stores the result.
 *
 * @param {string} complaintId — incident_id of the complaint
 * @param {string} feedbackText — citizen's feedback text
 * @returns {Promise<object>} — { success, sentiment, score }
 */
export async function submitFeedback(complaintId, feedbackText) {
    const res = await api.post(`/complaints/${complaintId}/feedback`, {
        feedback: feedbackText,
    });
    return res;
}
