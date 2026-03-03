import { useState, useEffect } from 'react';
import { FileText, Flame, CheckCircle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { getDashboardStats } from '../../services/api';
import { StatsCard, Loader, StatusBadge, SeverityBadge, CategoryTag, TimeAgo } from '../../components/Shared/Shared';
import { mockComplaints } from '../../data/mockData';
import './Dashboard.css';
const Dashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        getDashboardStats().then((res) => {
            setStats(res.stats);
            setLoading(false);
        });
    }, []);
    if (loading) return <div className="dash-page"><Loader size="lg" text="Loading dashboard..." /></div>;
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
                    <StatsCard icon={<Flame size={20} />} label="Active" value={stats.activeComplaints} change="12% of total" changeType="up" />
                    <StatsCard icon={<CheckCircle size={20} />} label="Resolution Rate" value={stats.resolutionRate + '%'} change="+2.1%" changeType="up" />
                    <StatsCard icon={<Clock size={20} />} label="Avg Response" value={stats.avgResponseTime} change="-0.3 days" changeType="up" />
                </div>
                <div className="charts-row">
                    <div className="chart-card card">
                        <h3>Category Distribution</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={stats.categoryBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                    {stats.categoryBreakdown.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="chart-card card">
                        <h3>Monthly Trends</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={stats.monthlyTrends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                                <Line type="monotone" dataKey="complaints" stroke="var(--primary-light)" strokeWidth={2.5} dot={{ fill: 'var(--primary-light)', r: 4 }} />
                                <Line type="monotone" dataKey="resolved" stroke="var(--success)" strokeWidth={2.5} dot={{ fill: 'var(--success)', r: 4 }} />
                                <Legend />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="chart-card card">
                    <h3>Department Performance</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.departmentPerformance} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                            <YAxis type="category" dataKey="dept" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} width={90} />
                            <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                            <Bar dataKey="resolved" fill="var(--success)" radius={[0, 4, 4, 0]} name="Resolved" />
                            <Bar dataKey="pending" fill="var(--warning)" radius={[0, 4, 4, 0]} name="Pending" />
                            <Legend />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                    <h3 style={{ marginBottom: 'var(--space-md)' }}>Recent Complaints</h3>
                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Category</th>
                                    <th>Severity</th>
                                    <th>Status</th>
                                    <th>Priority</th>
                                    <th>Location</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mockComplaints.map((c) => (
                                    <tr key={c.id}>
                                        <td><code style={{ color: 'var(--primary-light)', fontSize: '12px' }}>{c.id}</code></td>
                                        <td><CategoryTag category={c.category} /></td>
                                        <td><SeverityBadge severity={c.severity} /></td>
                                        <td><StatusBadge status={c.status} /></td>
                                        <td><strong>{c.priorityScore}</strong></td>
                                        <td className="text-sm text-muted">{c.address.split(',')[0]}</td>
                                        <td><TimeAgo date={c.createdAt} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default Dashboard;
