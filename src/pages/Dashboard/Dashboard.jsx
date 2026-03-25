import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Flame, CheckCircle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { getDashboardStats, getComplaints } from '../../services/api';
import { StatsCard, Loader, StatusBadge, SeverityBadge, CategoryTag, TimeAgo } from '../../components/Shared/Shared';
import './Dashboard.css';
const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        Promise.all([
            getDashboardStats(),
            getComplaints()
        ]).then(([statsRes, complaintsRes]) => {
            setStats(statsRes.stats);
            setComplaints(complaintsRes.complaints || []);
            setLoading(false);
        });
    }, []);
    if (loading) return <div className="dash-page"><Loader size="lg" text="Loading dashboard..." /></div>;

    // Sort by timestamp descending, show latest 10
    const recentComplaints = [...complaints]
        .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt))
        .slice(0, 10);

    return (
        <div className="dash-page">
            <div className="container">
                <div className="dash-header">
                    <div>
                        <h1 className="section-title">Dashboard</h1>
                        <p className="text-muted text-sm">Municipal Complaint Management — Pune</p>
                    </div>
                    <span className="dash-live">Live</span>
                </div>
                <div className="stats-grid">
                    <StatsCard icon={<FileText size={20} />} label="Total Complaints" value={stats.totalComplaints.toLocaleString()} change="+38 today" changeType="up" />
                    <StatsCard icon={<Flame size={20} />} label="Active" value={stats.activeComplaints} change="12% of total" changeType="warning" />
                    <StatsCard icon={<CheckCircle size={20} />} label="Resolved Today" value="42" change="High activity" changeType="up" />
                    <StatsCard icon={<Clock size={20} />} label="Pending Triage" value="8" change="Action needed" changeType="down" />
                </div>
                <div className="stats-grid" style={{ marginTop: 'var(--space-lg)' }}>
                    <StatsCard icon={<Clock size={20} />} label="Resolution Rate" value={stats.resolutionRate + '%'} change="+2.1%" changeType="up" />
                    <StatsCard icon={<Flame size={20} />} label="Avg Response" value={stats.avgResponseTime} change="-0.3 days" changeType="up" />
                </div>
                <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--space-md)' }}>Recent Complaints</h3>
                    {recentComplaints.length === 0 ? (
                        <p className="text-muted text-sm" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>No complaints in the system yet.</p>
                    ) : (
                        <div className="table-wrapper">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Category</th>
                                        <th>Severity</th>
                                        <th>Status</th>
                                        <th>Department</th>
                                        <th>Location</th>
                                        <th>Reported By</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentComplaints.map((c) => (
                                        <tr key={c.incident_id || c.id}>
                                            <td>
                                                <Link to={`/complaint/${c.incident_id || c.id}`}>
                                                    <code style={{ color: 'var(--primary-light)', fontSize: '12px' }}>{(c.incident_id || c.id)?.split('-').pop()}</code>
                                                </Link>
                                            </td>
                                            <td><CategoryTag category={c.category} /></td>
                                            <td><SeverityBadge severity={c.severity} /></td>
                                            <td><StatusBadge status={c.status} /></td>
                                            <td className="text-sm">{c.department || '—'}</td>
                                            <td className="text-sm text-muted" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.address}>
                                                {c.address ? (c.address.includes('°N') ? c.address : c.address.split(',').slice(0, 2).join(', ')) : '—'}
                                            </td>
                                            <td className="text-sm">{c.user_name || '—'}</td>
                                            <td><TimeAgo date={c.timestamp || c.createdAt} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
export default Dashboard;
