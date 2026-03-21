import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import AppLayout from './components/Layout/AppLayout';
import CitizenLayout from './components/Layout/CitizenLayout';
import Home from './pages/Home/Home';
import SubmitComplaint from './pages/SubmitComplaint/SubmitComplaint';
import MyComplaints from './pages/MyComplaints/MyComplaints';
import ComplaintDetail from './pages/ComplaintDetail/ComplaintDetail';
import Dashboard from './pages/Dashboard/Dashboard';
import Analytics from './pages/Analytics/Analytics';
import AdminComplaints from './pages/AdminComplaints/AdminComplaints';
import Worker from './pages/Worker/Worker';
import Login from './pages/Login/Login';

function AuthGate({ user, children }) {
    if (!user) return <Navigate to="/" replace />;
    return children;
}

function RoleGate({ user, roles, children }) {
    if (!user) return <Navigate to="/" replace />;
    if (!roles.includes(user.role)) {
        const fallback = user.role === 'citizen'
            ? '/'
            : user.role === 'admin'
                ? '/dashboard'
                : '/worker';
        return <Navigate to={fallback} replace />;
    }
    return children;
}

function AppFooter({ links, credit }) {
    return (
        <footer className="app-footer">
            <div className="container footer-inner">
                <div className="footer-brand">
                    <Landmark size={16} />
                    <span>SmartCityAI</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        Smart Municipal Complaint System
                    </span>
                </div>
                <div className="footer-links">
                    {links.map(link => (
                        <Link key={link.to} to={link.to}>{link.label}</Link>
                    ))}
                </div>
                <div className="footer-credit">{credit}</div>
            </div>
        </footer>
    );
}

const CITIZEN_FOOTER = [
    { to: '/',               label: 'Home' },
    { to: '/submit',         label: 'Report Issue' },
    { to: '/my-complaints',  label: 'My Complaints' },
];
const ADMIN_FOOTER = [
    { to: '/dashboard',  label: 'Dashboard' },
    { to: '/complaints', label: 'Complaints' },
    { to: '/analytics',  label: 'Analytics' },
];
const WORKER_FOOTER = [
    { to: '/worker',     label: 'My Tasks' },
    { to: '/complaints', label: 'Complaints' },
];
const CREDIT = 'Government of India | Smart City Mission | Powered by SmartCityAI';

function App() {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('civicai_user');
        return saved ? JSON.parse(saved) : null;
    });

    const handleLogin = userData => setUser(userData);

    const handleLogout = () => {
        localStorage.removeItem('civicai_user');
        localStorage.removeItem('civicai_token');
        setUser(null);
        window.location.hash = '#/';
    };

    return (
        <HashRouter>
            <Routes>

                {/* ── Root ── */}
                <Route
                    path="/"
                    element={
                        !user ? (
                            <Login onLogin={handleLogin} />
                        ) : user.role === 'citizen' ? (
                            <CitizenLayout user={user} onLogout={handleLogout}>
                                <Home />
                                <AppFooter links={CITIZEN_FOOTER} credit={CREDIT} />
                            </CitizenLayout>
                        ) : user.role === 'admin' ? (
                            <Navigate to="/dashboard" replace />
                        ) : (
                            <Navigate to="/worker" replace />
                        )
                    }
                />

                {/* ── Citizen routes ── */}
                <Route
                    path="/submit"
                    element={
                        <RoleGate user={user} roles={['citizen']}>
                            <CitizenLayout user={user} onLogout={handleLogout}>
                                <SubmitComplaint />
                                <AppFooter links={CITIZEN_FOOTER} credit={CREDIT} />
                            </CitizenLayout>
                        </RoleGate>
                    }
                />
                <Route
                    path="/my-complaints"
                    element={
                        <RoleGate user={user} roles={['citizen']}>
                            <CitizenLayout user={user} onLogout={handleLogout}>
                                <MyComplaints />
                                <AppFooter links={CITIZEN_FOOTER} credit={CREDIT} />
                            </CitizenLayout>
                        </RoleGate>
                    }
                />

                {/* ── Admin routes ── */}
                <Route
                    path="/dashboard"
                    element={
                        <RoleGate user={user} roles={['admin']}>
                            <AppLayout role="admin" user={user} onLogout={handleLogout}>
                                <Dashboard />
                                <AppFooter links={ADMIN_FOOTER} credit={CREDIT} />
                            </AppLayout>
                        </RoleGate>
                    }
                />
                <Route
                    path="/analytics"
                    element={
                        <RoleGate user={user} roles={['admin']}>
                            <AppLayout role="admin" user={user} onLogout={handleLogout}>
                                <Analytics />
                                <AppFooter links={ADMIN_FOOTER} credit={CREDIT} />
                            </AppLayout>
                        </RoleGate>
                    }
                />

                {/* ── Shared admin + worker routes ── */}
                <Route
                    path="/complaints"
                    element={
                        <RoleGate user={user} roles={['admin', 'worker']}>
                            <AppLayout role={user?.role} user={user} onLogout={handleLogout}>
                                <AdminComplaints />
                                <AppFooter
                                    links={user?.role === 'admin' ? ADMIN_FOOTER : WORKER_FOOTER}
                                    credit={CREDIT}
                                />
                            </AppLayout>
                        </RoleGate>
                    }
                />

                {/* ── Worker route — NOTE: user prop passed here ── */}
                <Route
                    path="/worker"
                    element={
                        <RoleGate user={user} roles={['worker']}>
                            <AppLayout role="worker" user={user} onLogout={handleLogout}>
                                {/* user prop added so Worker can filter tasks by phone */}
                                <Worker user={user} />
                                <AppFooter links={WORKER_FOOTER} credit={CREDIT} />
                            </AppLayout>
                        </RoleGate>
                    }
                />

                {/* ── Complaint detail — all roles ── */}
                <Route
                    path="/complaint/:id"
                    element={
                        <AuthGate user={user}>
                            {user?.role === 'citizen' ? (
                                <CitizenLayout user={user} onLogout={handleLogout}>
                                    <ComplaintDetail />
                                    <AppFooter links={CITIZEN_FOOTER} credit={CREDIT} />
                                </CitizenLayout>
                            ) : (
                                <AppLayout role={user?.role} user={user} onLogout={handleLogout}>
                                    <ComplaintDetail />
                                    <AppFooter
                                        links={user?.role === 'admin' ? ADMIN_FOOTER : WORKER_FOOTER}
                                        credit={CREDIT}
                                    />
                                </AppLayout>
                            )}
                        </AuthGate>
                    }
                />

                {/* ── Catch-all ── */}
                <Route
                    path="*"
                    element={
                        user ? (
                            <Navigate
                                to={user.role === 'citizen' ? '/' : user.role === 'admin' ? '/dashboard' : '/worker'}
                                replace
                            />
                        ) : (
                            <Navigate to="/" replace />
                        )
                    }
                />

            </Routes>
        </HashRouter>
    );
}

export default App;
