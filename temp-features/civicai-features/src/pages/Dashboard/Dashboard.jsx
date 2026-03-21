import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    FileText, Flame, CheckCircle, Clock,
    TrendingUp, MapPin, Shield, AlertTriangle,
} from 'lucide-react';
import {
    PieChart, Pie, Cell,
    LineChart, Line, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getDashboardStats, getComplaints, getSlaBreaches } from '../../services/api';
import {
    StatsCard, Loader, StatusBadge,
    SeverityBadge, CategoryTag, TimeAgo,
} from '../../components/Shared/Shared';
import './Dashboard.css';

const Dashboard = () => {
    const [stats,      setStats]      = useState(null);
    const [complaints, setComplaints] = useState([]);
    const [slaData,    setSlaData]    = useState({ breached: [], warning: [] });
    const [loading,    setLoading]    = useState(true);

    useEffect(() => {
        Promise.all([
            getDashboardStats(),
            getComplaints(),
            getSlaBreaches(),
        ]).then(([statsRes, complaintsRes, slaRes]) => {
            setStats(statsRes.stats);
            setComplaints(complaintsRes.complaints || []);
            setSlaData({ breached: slaRes.breached || [], warning: slaRes.warning || [] });
            setLoading(false);
        });
    }, []);

    if (loading)
        return <div className="dash-page"><Loader size="lg" text="Loading dashboard..." /></div>;

    const recentComplaints = [...complaints]
        .sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt))
        .slice(0, 8);

    const highPriority = complaints.filter(
        c => (c.priorityScore || 0) >= 70 && !['resolved', 'closed'].includes(c.status)
    );

    // Merge breached + warning for the alert panel, breached first
    const slaAlerts = [
        ...slaData.breached.map(c => ({ ...c, _slaType: 'breach' })),
        ...slaData.warning.map(c => ({ ...c, _slaType: 'warning' })),
    ].slice(0, 8);

    return (
        <div className="dash-page">
            <div className="container">
                <div className="dash-header">
                    <div>
                        <h1 className="section-title">Dashboard</h1>
                        <p className="text-muted text-sm">Municipal Complaint Management — Real-Time Overview</p>
                    </div>
                    <span className="dash-live"><span className="live-dot" /> Live</span>
                </div>

                {/* Primary KPI Row */}
                <div className="stats-grid">
                    <StatsCard
                        icon={<FileText size={20} />}
                        label="Total complaints"
                        value={stats.totalComplaints.toLocaleString()}
                        change={`${stats.pendingTriage} pending`}
                        changeType="warning"
                    />
                    <StatsCard
                        icon={<Flame size={20} />}
                        label="Active"
                        value={stats.activeComplaints}
                        change={`${Math.round((stats.activeComplaints / Math.max(stats.totalComplaints, 1)) * 100)}% of total`}
                        changeType="warning"
                    />
                    <StatsCard
                        icon={<CheckCircle size={20} />}
                        label="Resolved today"
                        value={stats.resolvedToday}
                        change="Keep it up!"
                        changeType="up"
                    />
                    <StatsCard
                        icon={<AlertTriangle size={20} />}
                        label="Pending triage"
                        value={stats.pendingTriage}
                        change="Needs attention"
                        changeType={stats.pendingTriage > 5 ? 'down' : 'up'}
                    />
                </div>

                {/* Secondary KPI Row — SLA breach card replaces generic slot */}
                <div className="stats-grid" style={{ marginTop: 'var(--space-md)' }}>
                    <StatsCard
                        icon={<TrendingUp size={20} />}
                        label="Resolution rate"
                        value={stats.resolutionRate + '%'}
                        change="Overall"
                        changeType="up"
                    />
                    <StatsCard
                        icon={<Clock size={20} />}
                        label="Avg response"
                        value={stats.avgResponseTime}
                        change="Target: <3 days"
                        changeType="up"
                    />
                    <StatsCard
                        icon={<Shield size={20} />}
                        label="SLA adherence"
                        value={stats.slaAdherence + '%'}
                        change="Within 7 days"
                        changeType={stats.slaAdherence >= 80 ? 'up' : 'down'}
                    />
                    {/* NEW: SLA breach card */}
                    <StatsCard
                        icon={<AlertTriangle size={20} />}
                        label="SLA breached"
                        value={stats.slaBreached ?? slaData.breached.length}
                        change={
                            slaData.warning.length > 0
                                ? `+${slaData.warning.length} expiring soon`
                                : 'Unresolved past deadline'
                        }
                        changeType={(stats.slaBreached ?? slaData.breached.length) > 0 ? 'down' : 'up'}
                    />
                </div>

                {/* Charts Row */}
                <div className="dash-charts-row">
                    <div className="chart-card card">
                        <h3>Category distribution</h3>
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie
                                    data={stats.categoryBreakdown}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {stats.categoryBreakdown.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background:   'var(--bg-secondary)',
                                        border:       '1px solid var(--border)',
                                        borderRadius: '8px',
                                        color:        'var(--text-primary)',
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="chart-card card">
                        <h3>Monthly trends</h3>
                        <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={stats.monthlyTrends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{
                                        background:   'var(--bg-secondary)',
                                        border:       '1px solid var(--border)',
                                        borderRadius: '8px',
                                        color:        'var(--text-primary)',
                                    }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="complaints"
                                    stroke="var(--primary-light)"
                                    strokeWidth={2.5}
                                    dot={{ fill: 'var(--primary-light)', r: 4 }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="resolved"
                                    stroke="var(--success)"
                                    strokeWidth={2.5}
                                    dot={{ fill: 'var(--success)', r: 4 }}
                                />
                                <Legend />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* SLA Breach Alert Panel — NEW */}
                {slaAlerts.length > 0 && (
                    <div className="card dash-alerts sla-alerts-card" style={{ marginTop: 'var(--space-lg)' }}>
                        <div className="alert-panel-header">
                            <h3>
                                <AlertTriangle
                                    size={16}
                                    style={{ color: 'var(--color-text-danger)', verticalAlign: 'middle', marginRight: 6 }}
                                />
                                SLA issues ({slaAlerts.length})
                            </h3>
                            <Link to="/complaints" className="btn btn-sm btn-secondary">View all</Link>
                        </div>
                        <div className="alert-list">
                            {slaAlerts.map(c => {
                                const isBreached = c._slaType === 'breach';
                                const msLeft     = c.sla_deadline
                                    ? new Date(c.sla_deadline).getTime() - Date.now()
                                    : null;
                                const label = isBreached
                                    ? `${c.hoursOverdue || Math.round(-msLeft / 3600000)}h overdue`
                                    : msLeft != null
                                        ? `${Math.round(msLeft / 3600000)}h left`
                                        : '';

                                return (
                                    <Link key={c.incident_id} to={`/complaint/${c.incident_id}`} className="alert-item">
                                        <CategoryTag category={c.category} />
                                        <span className="alert-desc">
                                            {c.description?.substring(0, 55) || c.address?.substring(0, 40) || c.incident_id}
                                            {(c.description?.length > 55 || c.address?.length > 40) ? '…' : ''}
                                        </span>
                                        <SeverityBadge severity={c.severity} />
                                        <span
                                            className="sla-pill-dash"
                                            style={{
                                                color:      isBreached ? 'var(--color-text-danger)'  : 'var(--color-text-warning)',
                                                background: isBreached ? 'var(--color-background-danger)' : 'var(--color-background-warning)',
                                            }}
                                        >
                                            {label}
                                        </span>
                                        {c.assigned_to_name && (
                                            <span className="alert-assignee">{c.assigned_to_name}</span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* High Priority Alert Panel (existing) */}
                {highPriority.length > 0 && (
                    <div className="card dash-alerts" style={{ marginTop: 'var(--space-lg)' }}>
                        <h3>
                            <AlertTriangle size={16} style={{ color: 'var(--severity-critical)' }} />
                            {' '}High priority issues ({highPriority.length})
                        </h3>
                        <div className="alert-list">
                            {highPriority.slice(0, 5).map(c => (
                                <Link key={c.incident_id} to={`/complaint/${c.incident_id}`} className="alert-item">
                                    <CategoryTag category={c.category} />
                                    <span className="alert-desc">
                                        {c.description?.substring(0, 60) || c.address?.substring(0, 40)}…
                                    </span>
                                    <SeverityBadge severity={c.severity} />
                                    <span className="alert-score">Score: {c.priorityScore}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Complaints table */}
                <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                        <h3>Recent complaints</h3>
                        <Link to="/complaints" className="btn btn-sm btn-secondary">View all</Link>
                    </div>
                    {recentComplaints.length === 0 ? (
                        <p className="text-muted text-sm" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
                            No complaints in the system yet.
                        </p>
                    ) : (
                        <div className="table-wrapper">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Category</th>
                                        <th>Severity</th>
                                        <th>Status</th>
                                        <th>Assigned to</th>
                                        <th>Department</th>
                                        <th>Location</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentComplaints.map(c => (
                                        <tr key={c.incident_id || c.id}>
                                            <td>
                                                <Link to={`/complaint/${c.incident_id || c.id}`}>
                                                    <code style={{ color: 'var(--primary-light)', fontSize: 12 }}>
                                                        {(c.incident_id || c.id)?.split('-').pop()}
                                                    </code>
                                                </Link>
                                            </td>
                                            <td><CategoryTag category={c.category} /></td>
                                            <td><SeverityBadge severity={c.severity} /></td>
                                            <td><StatusBadge status={c.status} /></td>
                                            <td className="text-sm">
                                                {c.assigned_to_name
                                                    ? <span className="assignee-tag">{c.assigned_to_name}</span>
                                                    : <span className="text-muted">—</span>
                                                }
                                            </td>
                                            <td className="text-sm">{c.department || '—'}</td>
                                            <td
                                                className="text-sm text-muted"
                                                style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={c.address}
                                            >
                                                {c.address
                                                    ? (c.address.includes('°N')
                                                        ? c.address
                                                        : c.address.split(',').slice(0, 2).join(', '))
                                                    : '—'
                                                }
                                            </td>
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
