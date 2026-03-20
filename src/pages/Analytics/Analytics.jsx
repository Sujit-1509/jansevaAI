import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { getDashboardStats } from '../../services/api';
import { Loader } from '../../components/Shared/Shared';
import { TrendingUp, Clock, Shield, MapPin, BarChart3, PieChart as PieIcon } from 'lucide-react';
import './Analytics.css';

const AnimatedKPI = ({ value, suffix = '' }) => {
    const [displayed, setDisplayed] = useState(0);
    useEffect(() => {
        const num = parseInt(value) || 0;
        if (num === 0) { setDisplayed(value); return; }
        let start = 0;
        const step = Math.max(1, Math.floor(num / 30));
        const timer = setInterval(() => {
            start += step;
            if (start >= num) { setDisplayed(num); clearInterval(timer); }
            else setDisplayed(start);
        }, 30);
        return () => clearInterval(timer);
    }, [value]);
    return <span className="analytics-kpi-value">{displayed}{suffix}</span>;
};

const Analytics = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getDashboardStats().then((res) => {
            setStats(res.stats);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="analytics-page"><Loader size="lg" text="Loading analytics..." /></div>;

    // Severity distribution from category data
    const SEVERITY_COLORS = { High: '#EF4444', Critical: '#DC2626', Medium: '#F59E0B', Low: '#10B981' };

    return (
        <div className="analytics-page">
            <div className="container">
                <div className="analytics-header">
                    <div>
                        <h1 className="section-title">Analytics & Insights</h1>
                        <p className="text-muted text-sm">Deep-dive data and historical performance trends — computed from live data</p>
                    </div>
                </div>

                {/* Animated KPI Row */}
                <div className="analytics-kpi-row">
                    <div className="analytics-kpi-card">
                        <div className="kpi-icon"><TrendingUp size={18} /></div>
                        <AnimatedKPI value={stats.resolutionRate} suffix="%" />
                        <span className="analytics-kpi-label">Resolution Rate</span>
                    </div>
                    <div className="analytics-kpi-card">
                        <div className="kpi-icon"><Clock size={18} /></div>
                        <span className="analytics-kpi-value">{stats.avgResponseTime}</span>
                        <span className="analytics-kpi-label">Avg Response</span>
                    </div>
                    <div className="analytics-kpi-card">
                        <div className="kpi-icon"><Shield size={18} /></div>
                        <AnimatedKPI value={stats.slaAdherence} suffix="%" />
                        <span className="analytics-kpi-label">SLA Adherence</span>
                    </div>
                    <div className="analytics-kpi-card">
                        <div className="kpi-icon"><MapPin size={18} /></div>
                        <span className="analytics-kpi-value">{stats.topHotspot?.substring(0, 15) || 'N/A'}</span>
                        <span className="analytics-kpi-label">Top Hotspot</span>
                    </div>
                </div>

                {/* Charts Row 1 */}
                <div className="charts-row">
                    <div className="chart-card card">
                        <h3><PieIcon size={14} /> Category Distribution</h3>
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
                        <h3><BarChart3 size={14} /> Monthly Trends</h3>
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

                {/* Department Performance */}
                <div className="chart-card card" style={{ marginTop: 'var(--space-lg)' }}>
                    <h3>Department Performance</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, stats.departmentPerformance.length * 45)}>
                        <BarChart data={stats.departmentPerformance} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                            <YAxis type="category" dataKey="dept" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} width={140} />
                            <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                            <Bar dataKey="resolved" fill="var(--success)" radius={[0, 4, 4, 0]} name="Resolved" />
                            <Bar dataKey="pending" fill="var(--warning)" radius={[0, 4, 4, 0]} name="Pending" />
                            <Legend />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Summary Stats */}
                <div className="analytics-summary" style={{ marginTop: 'var(--space-lg)' }}>
                    <div className="summary-card card">
                        <h4>Total Complaints</h4>
                        <span className="summary-big">{stats.totalComplaints}</span>
                    </div>
                    <div className="summary-card card">
                        <h4>Active Now</h4>
                        <span className="summary-big" style={{ color: 'var(--warning)' }}>{stats.activeComplaints}</span>
                    </div>
                    <div className="summary-card card">
                        <h4>Resolved Today</h4>
                        <span className="summary-big" style={{ color: 'var(--success)' }}>{stats.resolvedToday}</span>
                    </div>
                    <div className="summary-card card">
                        <h4>Pending Triage</h4>
                        <span className="summary-big" style={{ color: 'var(--severity-critical)' }}>{stats.pendingTriage}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
