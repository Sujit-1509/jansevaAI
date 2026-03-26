import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Shield, Loader2, User, BarChart3, HardHat } from 'lucide-react';
import { login, verifyOtp } from '../../services/api';
import './Login.css';
const roles = [
    { id: 'citizen', label: 'Citizen', icon: <User size={18} />, desc: 'Report & track civic issues' },
    { id: 'admin', label: 'Administrator', icon: <BarChart3 size={18} />, desc: 'Manage complaints' },
    { id: 'worker', label: 'Field Worker', icon: <HardHat size={18} />, desc: 'Resolve assignments' },
];
const Login = ({ onLogin }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [selectedRole, setSelectedRole] = useState('citizen');
    const [otpSent, setOtpSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setError(null);
        if (phone.length < 10) return;
        setLoading(true);
        try {
            await login('+91' + phone);
            setOtpSent(true);
        } catch (err) {
            setError('Failed to send OTP. Please check your connection or API deployment.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    const handleVerify = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await verifyOtp('+91' + phone, otp, selectedRole);
            if (res.success) {
                // Token is stored in localStorage by the api.js verifyOtp function
                const userData = { ...res.user, name, phone: '+91' + phone, role: selectedRole };
                localStorage.setItem('jansevaai_user', JSON.stringify(userData));
                onLogin(userData);
                if (selectedRole === 'citizen') navigate('/');
                else if (selectedRole === 'admin') navigate('/dashboard');
                else navigate('/worker');
            }
        } catch (err) {
            setError('Invalid OTP or connection error. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="login-page">
            <div className="login-card card animate-fade-in">
                <div className="login-brand">
                    <img
                        src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg"
                        alt="Emblem of India"
                        className="login-emblem-img"
                    />
                    <h1>JanSevaAI</h1>
                    <p className="text-muted">Smart Municipal Complaint System</p>
                    <p className="login-gov-tag">Government of India · Smart City Mission</p>
                </div>
                <div className="login-role-section">
                    <label className="login-role-label">Login as</label>
                    <div className="login-roles">
                        {roles.map((role) => (
                            <button
                                key={role.id}
                                type="button"
                                className={`login-role-card ${selectedRole === role.id ? 'active' : ''}`}
                                onClick={() => setSelectedRole(role.id)}
                            >
                                <span className="login-role-icon">{role.icon}</span>
                                <span className="login-role-name">{role.label}</span>
                                <span className="login-role-desc">{role.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="login-error">
                        {error}
                    </div>
                )}
                {!otpSent ? (
                    <form onSubmit={handleSendOtp}>
                        <div className="input-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Enter your full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="input-group">
                            <label>Phone Number</label>
                            <div className="phone-input">
                                <span className="phone-prefix">+91</span>
                                <input
                                    type="tel"
                                    className="input"
                                    placeholder="9876543210"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    maxLength={10}
                                />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary login-btn" disabled={name.trim().length === 0 || phone.length < 10 || loading}>
                            {loading ? <Loader2 size={16} className="spin-icon" /> : <><Phone size={16} /> Send OTP</>}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleVerify}>
                        <p className="otp-msg text-sm">OTP sent to <strong>+91 {phone}</strong></p>
                        <div className="input-group">
                            <label>Enter OTP</label>
                            <input
                                type="text"
                                className="input otp-input"
                                placeholder="123456"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary login-btn" disabled={otp.length < 6 || loading}>
                            {loading ? <Loader2 size={16} className="spin-icon" /> : <><Shield size={16} /> Verify & Login</>}
                        </button>
                        <button type="button" className="btn btn-secondary login-btn" onClick={() => setOtpSent(false)}>
                            Change Number
                        </button>
                    </form>
                )}
                <p className="login-demo text-sm text-muted">
                    Demo: Enter any 10-digit number and OTP <code>123456</code>
                </p>
            </div>
        </div>
    );
};
export default Login;
