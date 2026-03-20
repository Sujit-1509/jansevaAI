import { api, uploadToS3 } from './apiClient';
import { mockComplaints, mockDashboardStats } from '../data/mockData';
import {
    normalizeComplaint,
    normalizeComplaintList,
    normalizeStatus,
} from './complaintModel';

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
        console.warn('API unreachable, using mock complaints:', err.message);
        let results = normalizeComplaintList(mockComplaints);

        if (filters.status) {
            results = results.filter((c) => c.status === normalizeStatus(filters.status));
        }

        if (filters.category) {
            const mappedCats = {
                road_issue: ['road_issue', 'pothole'],
                waste: ['waste', 'garbage'],
                lighting: ['lighting', 'streetlight', 'broken_streetlight'],
            };
            const validCats = mappedCats[filters.category] || [filters.category];
            results = results.filter((c) => validCats.includes(c.category));
        }

        if (filters.severity) {
            results = results.filter((c) => c.severity === filters.severity);
        }

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
        console.warn('API unreachable, using mock complaint:', err.message);
        const complaint = normalizeComplaintList(mockComplaints).find((c) => c.incident_id === id);
        if (!complaint) {
            return { success: false, error: 'Complaint not found' };
        }
        return { success: true, complaint };
    }
}

export async function getNearbyComplaints(lat, lng, radius = 500) {
    try {
        const res = await api.get('/complaints/nearby', { lat, lng, radius });
        return {
            ...res,
            complaints: normalizeComplaintList(res.complaints || []),
        };
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

// upload multiple images in parallel, analyze the first one
export async function analyzeImages(imageFiles) {
    try {
        // get presigned URL for the primary image first
        const primary = imageFiles[0];
        const primaryPresign = await getUploadUrl(primary.name, primary.type);
        if (!primaryPresign?.upload_url) {
            throw new Error('Could not get upload URL');
        }

        const incidentId = primaryPresign.incident_id;
        const s3Keys = [primaryPresign.s3_key];

        // upload primary image
        await uploadToS3(primaryPresign.upload_url, primary);

        // upload remaining images in parallel (sharing the same incident_id)
        const secondaryFiles = imageFiles.slice(1);
        if (secondaryFiles.length > 0) {
            const secondaryUploads = secondaryFiles.map(async (file, i) => {
                const presign = await getUploadUrl(file.name, file.type, incidentId, i + 2);
                if (presign?.upload_url) {
                    await uploadToS3(presign.upload_url, file);
                    return presign.s3_key;
                }
                return null;
            });
            const keys = await Promise.all(secondaryUploads);
            s3Keys.push(...keys.filter(Boolean));
        }

        // poll for the result (triggered by the primary image)
        const result = await pollForResult(incidentId);

        if (!result) {
            throw new Error('Processing timed out, result will appear shortly');
        }

        let category = result.category;
        let subCategory = result.category;

        if (!category || category.toLowerCase() === 'unknown') {
            const dept = (result.department || '').toLowerCase();
            if (dept.includes('road')) {
                category = 'road_issue';
                subCategory = 'pothole';
            } else if (dept.includes('sanitation')) {
                category = 'waste';
                subCategory = 'garbage_accumulation';
            } else if (dept.includes('electrical')) {
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
    } catch (err) {
        console.warn('Multi-image analysis failed, using mock analysis:', err.message);
        return {
            success: true,
            analysis: {
                category: 'road_issue',
                subCategory: 'pothole',
                severity: 'high',
                confidence: 0.92,
                description:
                    'Large pothole detected on main road causing traffic disruption. Immediate repair recommended.',
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
}

export async function analyzeImage(imageFile) {
    try {
        const presign = await getUploadUrl(imageFile.name, imageFile.type);
        if (!presign?.upload_url) {
            throw new Error('Could not get upload URL');
        }

        await uploadToS3(presign.upload_url, imageFile);
        const result = await pollForResult(presign.incident_id);

        if (!result) {
            throw new Error('Processing timed out, result will appear shortly');
        }

        let category = result.category;
        let subCategory = result.category;

        if (!category || category.toLowerCase() === 'unknown') {
            const dept = (result.department || '').toLowerCase();
            if (dept.includes('road')) {
                category = 'road_issue';
                subCategory = 'pothole';
            } else if (dept.includes('sanitation')) {
                category = 'waste';
                subCategory = 'garbage_accumulation';
            } else if (dept.includes('electrical')) {
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
            s3Key: presign.s3_key,
            incidentId: presign.incident_id,
        };
    } catch (err) {
        console.warn('Image analysis API failed, using mock analysis:', err.message);
        return {
            success: true,
            analysis: {
                category: 'road_issue',
                subCategory: 'pothole',
                severity: 'high',
                confidence: 0.92,
                description:
                    'Large pothole detected on main road causing traffic disruption. The pothole measures approximately 2x3 feet with a depth of 6 inches. Immediate repair recommended to prevent vehicle damage.',
                priorityScore: 78,
                department: 'PWD',
                estimatedResolutionTime: '2-3 days',
                suggestedActions: [
                    'Fill pothole with asphalt',
                    'Place warning cones around area',
                    'Divert traffic if needed',
                ],
            },
        };
    }
}

async function pollForResult(incidentId) {
    const maxAttempts = 20;
    const delayMs = 3000;

    for (let i = 0; i < maxAttempts; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
            const res = await api.get(`/complaints/${incidentId}`);
            const item = res?.complaint || res || {};
            if (item?.incident_id && item?.severity) {
                return normalizeComplaint(item);
            }
        } catch {
            // Keep polling until timeout.
        }
    }

    return null;
}

export async function getDashboardStats() {
    try {
        return await api.get('/dashboard/stats');
    } catch (err) {
        console.warn('API unreachable, using mock dashboard stats:', err.message);
        return { success: true, stats: mockDashboardStats };
    }
}

export async function getWorkerAssignments() {
    try {
        const res = await api.get('/worker/assignments');
        return {
            ...res,
            assignments: normalizeComplaintList(res.assignments || []),
        };
    } catch (err) {
        console.warn('API unreachable, using mock worker assignments:', err.message);
        const assignments = normalizeComplaintList(mockComplaints).filter(
            (c) => c.status === 'assigned' || c.status === 'in_progress'
        );
        return { success: true, assignments };
    }
}
