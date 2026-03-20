import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowUpDown, Clock, Search, Download, FileText, Loader2, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { getComplaints, updateComplaintStatus } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, Loader, EmptyState, PriorityBar } from '../../components/Shared/Shared';
import './AdminComplaints.css';

// Priority score is now exclusively calculated by the backend Lambda
// and provided via the API.


const AdminComplaints = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState('timestamp');
    const [sortDirection, setSortDirection] = useState('desc');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [updatingId, setUpdatingId] = useState(null);

    useEffect(() => {
        fetchComplaints();
    }, []);

    const fetchComplaints = () => {
        setLoading(true);
        getComplaints().then((res) => {
            setComplaints(res.complaints || []);
            setLoading(false);
        });
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const handleStatusChange = async (incidentId, newStatus) => {
        setUpdatingId(incidentId);
        try {
            const res = await updateComplaintStatus(incidentId, newStatus, "Status updated by admin");
            if (res.success) {
                setComplaints(complaints.map(c =>
                    c.incident_id === incidentId ? { ...c, status: newStatus } : c
                ));
            } else {
                alert('Failed to update status');
            }
        } catch (error) {
            console.error(error);
            alert('Error updating status');
        } finally {
            setUpdatingId(null);
        }
    };

    // Status counts from real data
    const statusCounts = {
        submitted: complaints.filter(c => c.status === 'submitted').length,
        assigned: complaints.filter(c => c.status === 'assigned').length,
        in_progress: complaints.filter(c => c.status === 'in_progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        closed: complaints.filter(c => c.status === 'closed').length,
    };

    const getSortedAndFilteredComplaints = () => {
        let filtered = complaints;

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(c => c.status === statusFilter);
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(c =>
                (c.incident_id || '').toLowerCase().includes(q) ||
                (c.description || '').toLowerCase().includes(q) ||
                (c.address || '').toLowerCase().includes(q) ||
                (c.user_name || '').toLowerCase().includes(q) ||
                (c.department || '').toLowerCase().includes(q) ||
                (c.category || '').toLowerCase().includes(q)
            );
        }

        return [...filtered].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];
            if (sortField === 'timestamp') {
                valA = new Date(valA).getTime() || 0;
                valB = new Date(valB).getTime() || 0;
            }
            if (sortField === 'location') {
                valA = a.address || '';
                valB = b.address || '';
            }
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const displayedComplaints = getSortedAndFilteredComplaints();

    // CSV Export
    const exportToCSV = () => {
        const headers = ['Incident ID', 'Category', 'Severity', 'Priority Score', 'Status', 'Department', 'Location', 'Reported By', 'Date', 'Description'];
        const rows = displayedComplaints.map(c => [
            c.incident_id || '',
            c.category || '',
            c.severity || '',
            c.priorityScore || '',
            c.status || '',
            c.department || '',
            (c.address || '').replace(/,/g, ' |'),
            c.user_name || '',
            c.timestamp ? new Date(c.timestamp).toLocaleDateString() : '',
            (c.description || '').replace(/,/g, ' ').replace(/\n/g, ' ')
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `civicai_complaints_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div className="admin-complaints-page">
            <div className="container" style={{ maxWidth: '1200px' }}>
                <div className="ac-header">
                    <div>
                        <h1 className="section-title">All Complaints Overview</h1>
                        <p className="text-muted text-sm">Manage, sort, and update citizen issues</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={fetchComplaints} title="Refresh data" disabled={loading}>
                            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh
                        </button>
                        <button className="btn btn-secondary btn-sm export-btn" onClick={exportToCSV} title="Export to CSV">
                            <Download size={14} /> Export CSV
                        </button>
                    </div>
                </div>

                {/* Status Summary Cards */}
                {!loading && (
                    <div className="status-summary-grid">
                        <div className="status-summary-card" onClick={() => setStatusFilter('all')}>
                            <div className="ssc-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}><FileText size={18} /></div>
                            <div><span className="ssc-value">{complaints.length}</span><span className="ssc-label">Total</span></div>
                        </div>
                        <div className="status-summary-card" onClick={() => setStatusFilter('submitted')}>
                            <div className="ssc-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#818CF8' }}><Loader2 size={18} /></div>
                            <div><span className="ssc-value">{statusCounts.submitted}</span><span className="ssc-label">Submitted</span></div>
                        </div>
                        <div className="status-summary-card" onClick={() => setStatusFilter('in_progress')}>
                            <div className="ssc-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#60A5FA' }}><Clock size={18} /></div>
                            <div><span className="ssc-value">{statusCounts.in_progress}</span><span className="ssc-label">In Progress</span></div>
                        </div>
                        <div className="status-summary-card" onClick={() => setStatusFilter('resolved')}>
                            <div className="ssc-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399' }}><CheckCircle size={18} /></div>
                            <div><span className="ssc-value">{statusCounts.resolved}</span><span className="ssc-label">Resolved</span></div>
                        </div>
                        <div className="status-summary-card" onClick={() => setStatusFilter('closed')}>
                            <div className="ssc-icon" style={{ background: 'rgba(107,114,128,0.1)', color: '#9CA3AF' }}><AlertTriangle size={18} /></div>
                            <div><span className="ssc-value">{statusCounts.closed}</span><span className="ssc-label">Closed</span></div>
                        </div>
                    </div>
                )}

                {/* Search + Filters */}
                <div className="ac-toolbar card">
                    <div className="ac-search-wrapper">
                        <Search size={16} className="ac-search-icon" />
                        <input
                            type="text"
                            className="ac-search-input"
                            placeholder="Search by ID, description, location, name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="ac-filters">
                        <span className="filter-label">Status:</span>
                        {['all', 'submitted', 'assigned', 'in_progress', 'resolved', 'closed'].map((s) => (
                            <button
                                key={s}
                                className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                                onClick={() => setStatusFilter(s)}
                            >
                                {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </button>
                        ))}
                        <span className="results-count text-muted text-sm" style={{ marginLeft: 'auto' }}>
                            Showing {displayedComplaints.length} results
                        </span>
                    </div>
                </div>

                {loading ? (
                    <Loader text="Loading all complaints..." />
                ) : complaints.length === 0 ? (
                    <EmptyState
                        icon={<ClipboardList size={32} />}
                        title="No complaints in the system"
                        description="As an admin, you will see all complaints here once they are submitted."
                    />
                ) : (
                    <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Category</th>
                                    <th>Severity</th>
                                    <th onClick={() => handleSort('priorityScore')} className="sortable-header">
                                        Priority <ArrowUpDown size={12} className="sort-icon" />
                                    </th>
                                    <th onClick={() => handleSort('timestamp')} className="sortable-header">
                                        Date <ArrowUpDown size={12} className="sort-icon" />
                                    </th>
                                    <th>Department</th>
                                    <th onClick={() => handleSort('location')} className="sortable-header">
                                        Location <ArrowUpDown size={12} className="sort-icon" />
                                    </th>
                                    <th>Reported By</th>
                                    <th>Status & Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedComplaints.map((c) => (
                                    <tr key={c.incident_id}>
                                        <td className="id-cell">
                                            <Link to={`/complaint/${c.incident_id}`}>{c.incident_id?.split('-').pop()}</Link>
                                        </td>
                                        <td><CategoryTag category={c.category} /></td>
                                        <td><SeverityBadge severity={c.severity} /></td>
                                        <td>
                                            <div style={{ width: '80px' }}>
                                                <PriorityBar score={c.priorityScore || 0} />
                                            </div>
                                        </td>
                                        <td className="date-cell">
                                            <div className="date-text">
                                                <Clock size={12} />
                                                {new Date(c.timestamp || c.createdAt).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="text-sm dept-cell">{c.department || '—'}</td>
                                        <td className="location-cell text-sm text-muted">
                                            <div className="truncate-text" title={c.address}>
                                                {c.address?.includes('°N') ? c.address : c.address?.split(',').slice(0, 2).join(', ')}
                                            </div>
                                        </td>
                                        <td className="text-sm reporter-cell">{c.user_name || '—'}</td>
                                        <td className="action-cell">
                                            {updatingId === c.incident_id ? (
                                                <span className="text-sm text-primary">Updating...</span>
                                            ) : (
                                                <select
                                                    className={`status-select status-${c.status || 'submitted'}`}
                                                    value={c.status || 'submitted'}
                                                    onChange={(e) => handleStatusChange(c.incident_id, e.target.value)}
                                                >
                                                    <option value="submitted">Submitted</option>
                                                    <option value="assigned">Assigned</option>
                                                    <option value="in_progress">In Progress</option>
                                                    <option value="resolved">Resolved</option>
                                                    <option value="closed">Closed</option>
                                                </select>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminComplaints;
