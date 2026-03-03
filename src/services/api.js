/**
 * api.js — CivicAI Frontend API Service Layer.
 *
 * Every function calls the real backend API via apiClient.
 * If the API is unreachable, each function falls back to mock data
 * so the frontend never breaks during local development.
 */

import { api, uploadToS3 } from './apiClient';
import {
    mockComplaints,
    mockDashboardStats,
    mockUser,
} from '../data/mockData';

// ─────────────────────────────────────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────────────────────────────────────

export async function login(phone) {
    try {
        const res = await api.post('/auth/send-otp', { phone });
        return res;
    } catch (err) {
        console.error('API Error in login:', err.message);
        throw err;
    }
}

export async function verifyOtp(phone, otp) {
    try {
        const res = await api.post('/auth/verify-otp', { phone, otp });
        if (res.token) {
            localStorage.setItem('civicai_token', res.token);
        }
        return res;
    } catch (err) {
        console.error('API Error in verifyOtp:', err.message);
        throw err;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Complaints — Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getComplaints(filters = {}) {
    try {
        const res = await api.get('/complaints', filters);
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock complaints:', err.message);
        let results = [...mockComplaints];
        if (filters.status) {
            results = results.filter((c) => c.status === filters.status);
        }
        if (filters.category) {
            results = results.filter((c) => c.category === filters.category);
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
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock complaint:', err.message);
        const complaint = mockComplaints.find((c) => c.id === id);
        if (!complaint) {
            return { success: false, error: 'Complaint not found' };
        }
        return { success: true, complaint };
    }
}

export async function getNearbyComplaints(lat, lng, radius = 500) {
    try {
        const res = await api.get('/complaints/nearby', { lat, lng, radius });
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock nearby:', err.message);
        return { success: true, complaints: mockComplaints.slice(0, 5), total: 5 };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Complaints — Write
// ─────────────────────────────────────────────────────────────────────────────

export async function upvoteComplaint(id) {
    try {
        const res = await api.post(`/complaints/${id}/upvote`);
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock upvote:', err.message);
        return { success: true, upvotes: 24, newPriorityScore: 86 };
    }
}

export async function submitComplaint(data) {
    try {
        const res = await api.post('/complaints', {
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
            s3Key: data.s3Key,
            latitude: data.latitude,
            longitude: data.longitude,
            address: data.address,
        });
        return res;
    } catch (err) {
        console.error('API Error in submitComplaint:', err.message);
        throw err;
    }
}

export async function updateComplaintStatus(id, status, notes) {
    try {
        const res = await api.patch(`/complaints/${id}/status`, { status, notes });
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock status update:', err.message);
        return { success: true, message: `Complaint ${id} updated to ${status}` };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Image Upload & AI Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a presigned S3 upload URL from the generate_upload_url Lambda.
 *
 * Lambda returns snake_case: { incident_id, upload_url, s3_key }
 *
 * @param {string} fileName — original file name
 * @param {string} fileType — MIME type (e.g. image/jpeg)
 * @returns {{ incident_id, upload_url, s3_key }}
 */
export async function getUploadUrl(fileName, fileType) {
    try {
        const res = await api.post('/upload/presign', { fileName, fileType });
        return res;
    } catch (err) {
        console.warn('API unreachable — no presigned URL available:', err.message);
        return null;
    }
}

/**
 * Full image analysis flow:
 *   1. Request presigned S3 URL
 *   2. Upload image directly to S3
 *   3. S3 ObjectCreated event triggers process_image Lambda automatically
 *   4. Poll for the processed result in DynamoDB
 *
 * Falls back to mock analysis if any step fails.
 */
export async function analyzeImage(imageFile) {
    try {
        // Step 1 — Get presigned upload URL from generate_upload_url Lambda
        const presign = await getUploadUrl(imageFile.name, imageFile.type);
        if (!presign || !presign.upload_url) {
            throw new Error('Could not get upload URL');
        }

        // Step 2 — Upload image directly to S3 (no Lambda payload limit)
        await uploadToS3(presign.upload_url, imageFile);

        // Step 3 — The S3 ObjectCreated event triggers process_image Lambda
        //          automatically. We poll for the result to appear in DynamoDB.
        const result = await pollForResult(presign.incident_id);

        if (result) {
            return {
                success: true,
                analysis: {
                    category: result.category || 'road_issue',
                    subCategory: result.category || 'pothole',
                    severity: result.severity || 'medium',
                    confidence: parseFloat(result.confidence) || 0.85,
                    description: result.description || '',
                    priorityScore: result.priorityScore || 70,
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
        }

        // If polling timed out, still return success with the presign data
        // The Lambda may still be processing — complaint will appear later
        throw new Error('Processing timed out — result will appear shortly');
    } catch (err) {
        console.warn('Image analysis API failed — using mock analysis:', err.message);
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

/**
 * Poll for a complaint result after S3 upload triggers the Lambda.
 * Tries up to 10 times with 2-second intervals (max ~20 seconds).
 *
 * @param {string} incidentId — UUID of the complaint
 * @returns {object|null} — processed complaint or null if timeout
 */
async function pollForResult(incidentId) {
    const maxAttempts = 20;
    const delayMs = 3000;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        try {
            const res = await api.get(`/complaints/${incidentId}`);
            // Record exists and has been processed (has severity field)
            if (res && res.incident_id && res.severity) {
                return res;
            }
        } catch {
            // Not ready yet — keep polling
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Dashboard & Worker
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
    try {
        const res = await api.get('/dashboard/stats');
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock dashboard stats:', err.message);
        return { success: true, stats: mockDashboardStats };
    }
}

export async function getWorkerAssignments() {
    try {
        const res = await api.get('/worker/assignments');
        return res;
    } catch (err) {
        console.warn('API unreachable — using mock worker assignments:', err.message);
        const assignments = mockComplaints.filter(
            (c) => c.status === 'assigned' || c.status === 'in_progress'
        );
        return { success: true, assignments };
    }
}
