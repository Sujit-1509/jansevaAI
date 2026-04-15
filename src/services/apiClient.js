/**
 * apiClient.js — Shared HTTP client for JanSevaAI frontend.
 *
 * Wraps fetch() with:
 *  - Base URL from VITE_API_BASE_URL env variable
 *  - Automatic JSON parsing
 *  - Auth token injection from localStorage
 *  - Standardized error handling
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * Make an HTTP request to the backend API.
 *
 * @param {string} endpoint  — API path (e.g. '/complaints')
 * @param {object} options   — fetch options override
 * @returns {Promise<object>} — parsed JSON response
 */
export async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('jansevaai_token');

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    // If body is FormData, remove Content-Type so browser sets boundary
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    const url = `${BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // Handle 401 Unauthorized - redirect to login
    if (response.status === 401) {
        localStorage.removeItem('jansevaai_token');
        localStorage.removeItem('jansevaai_user');
        window.location.hash = '#/';
        window.location.reload();
        return Promise.reject(new Error('Unauthorized - redirecting to login'));
    }

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = new Error(errorBody.message || `API Error: ${response.status}`);
        error.status = response.status;
        error.data = errorBody;
        throw error;
    }

    const data = await response.json();

    // Unwrap Lambda proxy response format: { statusCode, headers, body }
    if (data.statusCode && data.body && typeof data.body === 'string') {
        try {
            return JSON.parse(data.body);
        } catch {
            return data;
        }
    }

    return data;
}

/**
 * Convenience methods for common HTTP verbs.
 */
export const api = {
    get: (endpoint, params = {}) => {
        const query = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v != null && v !== '')
        ).toString();
        const url = query ? `${endpoint}?${query}` : endpoint;
        return apiRequest(url, { method: 'GET', cache: 'no-store' });
    },

    post: (endpoint, body) =>
        apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    patch: (endpoint, body) =>
        apiRequest(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(body),
        }),

    put: (endpoint, body) =>
        apiRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        }),

    delete: (endpoint) =>
        apiRequest(endpoint, { method: 'DELETE' }),
};

/**
 * Upload a file to a presigned S3 URL.
 * This bypasses the API client since it goes directly to S3.
 *
 * @param {string} presignedUrl — S3 presigned PUT URL
 * @param {File} file           — File object to upload
 * @returns {Promise<Response>}
 */
export async function uploadToS3(presignedUrl, file) {
    const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type || 'image/jpeg',
        },
    });

    if (!response.ok) {
        throw new Error(`S3 upload failed: ${response.status}`);
    }

    return response;
}
