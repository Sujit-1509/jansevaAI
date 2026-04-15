import { api } from './apiClient';

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
            localStorage.setItem('jansevaai_token', res.token);
        }
        return res;
    } catch (err) {
        console.error('API Error in verifyOtp:', err.message);
        throw err;
    }
}
