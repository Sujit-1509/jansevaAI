import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import AppLayout from './components/Layout/AppLayout';
import CitizenLayout from './components/Layout/CitizenLayout';
import Home from './pages/Home/Home';
import SubmitComplaint from './pages/SubmitComplaint/SubmitComplaint';
import MyComplaints from './pages/MyComplaints/MyComplaints';
import ComplaintDetail from './pages/ComplaintDetail/ComplaintDetail';
import Dashboard from './pages/Dashboard/Dashboard';
import Worker from './pages/Worker/Worker';
import Login from './pages/Login/Login';
import './App.css';
function App() {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('civicai_user');
        return saved ? JSON.parse(saved) : null;
    });
    const handleLogin = (userData) => {
        setUser(userData);
    };
    const handleLogout = () => {
        localStorage.removeItem('civicai_user');
        localStorage.removeItem('civicai_token');
        setUser(null);
    };
    if (!user) {
        return (
            <BrowserRouter>
                <Routes>
                    <Route path="*" element={<Login onLogin={handleLogin} />} />
                </Routes>
            </BrowserRouter>
        );
    }
    const userRole = user.role || 'citizen';
    return (
        <BrowserRouter>
            <>
                {userRole === "citizen" ? (
                    <CitizenLayout user={user}>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/submit" element={<SubmitComplaint />} />
                            <Route path="/my-complaints" element={<MyComplaints />} />
                            <Route path="/complaint/:id" element={<ComplaintDetail />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                        <footer className="app-footer">
                            <div className="container footer-inner">
                                <div className="footer-brand">
                                    <Landmark size={16} />
                                    <span>CivicAI</span>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— Smart Municipal Complaint System</span>
                                </div>
                                <div className="footer-links">
                                    <Link to="/">Home</Link>
                                    <Link to="/submit">Report Issue</Link>
                                    <Link to="/my-complaints">My Complaints</Link>
                                </div>
                                <div className="footer-credit">
                                    Government of India · Smart City Mission · Powered by AI
                                </div>
                            </div>
                        </footer>
                    </CitizenLayout>
                ) : (
                    <AppLayout role={userRole} user={user}>
                        <Routes>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/complaints" element={<MyComplaints />} />
                            <Route path="/analytics" element={<Dashboard />} />
                            <Route path="/worker" element={<Worker />} />
                            <Route path="/complaint/:id" element={<ComplaintDetail />} />
                            <Route path="*" element={<Navigate to={userRole === 'admin' ? '/dashboard' : '/worker'} replace />} />
                        </Routes>
                        <footer className="app-footer">
                            <div className="container footer-inner">
                                <div className="footer-brand">
                                    <Landmark size={16} />
                                    <span>CivicAI</span>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— Smart Municipal Complaint System</span>
                                </div>
                                <div className="footer-links">
                                    <Link to="/dashboard">Dashboard</Link>
                                    <Link to="/complaints">Complaints</Link>
                                    <Link to="/worker">Worker</Link>
                                </div>
                                <div className="footer-credit">
                                    Government of India · Smart City Mission · Powered by AI
                                </div>
                            </div>
                        </footer>
                    </AppLayout>
                )}
            </>
        </BrowserRouter>
    );
}
export default App;
