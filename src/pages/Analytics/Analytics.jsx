import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { getDashboardStats } from '../../services/api';
import { Loader } from '../../components/Shared/Shared';
import './Analytics.css';

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

    return (
        <div className="analytics-page">
            <div className="container">
                <div className="analytics-header">
                    <div>
                        <h1 className="section-title">Analytics & Insights</h1>
                        <p className="text-muted text-sm">Deep-dive data and historical performance trends</p>
                    </div>
                </div>
                
                {/* Custom KPIs for Analytics */}
                <div className="analytics-kpi-row">
                    <div className="analytics-kpi-card">
                        <span className="analytics-kpi-value">{stats.resolutionRate}%</span>
                        <span className="analytics-kpi-label">Resolution Rate</span>
                    </div>
                    <div className="analytics-kpi-card">
                        <span className="analytics-kpi-value">{stats.avgResponseTime}</span>
                        <span className="analytics-kpi-label">Avg Response</span>
                    </div>
                    <div className="analytics-kpi-card">
                        <span className="analytics-kpi-value">92%</span>
                        <span className="analytics-kpi-label">SLA Adherence</span>
                    </div>
                    <div className="analytics-kpi-card">
                        <span className="analytics-kpi-value">Baner</span>
                        <span className="analytics-kpi-label">Top Hotspot</span>
                    </div>
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
                
                <div className="chart-card card" style={{ marginTop: 'var(--space-lg)' }}>
                    <h3>Department Performance</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={stats.departmentPerformance} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                            <YAxis type="category" dataKey="dept" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} width={120} />
                            <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                            <Bar dataKey="resolved" fill="var(--success)" radius={[0, 4, 4, 0]} name="Resolved" />
                            <Bar dataKey="pending" fill="var(--warning)" radius={[0, 4, 4, 0]} name="Pending" />
                            <Legend />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
