import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowUpDown, Clock, Search, Download, FileText, Loader2, CheckCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Image } from 'lucide-react';
import { getComplaints, updateComplaintStatus } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, Loader, EmptyState, PriorityBar } from '../../components/Shared/Shared';
import './AdminComplaints.css';

const AdminComplaints = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState('timestamp');
    const [sortDirection, setSortDirection] = useState('desc');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [updatingId, setUpdatingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

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

    const statusCounts = {
        all: complaints.length,
        submitted: complaints.filter(c => c.status === 'submitted').length,
        assigned: complaints.filter(c => c.status === 'assigned').length,
        in_progress: complaints.filter(c => c.status === 'in_progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
        closed: complaints.filter(c => c.status === 'closed').length,
    };

    // Get unique categories
    const categories = [...new Set(complaints.map(c => c.category).filter(Boolean))];

    const getSortedAndFilteredComplaints = () => {
        let filtered = complaints;

        if (statusFilter !== 'all') {
            filtered = filtered.filter(c => c.status === statusFilter);
        }

        if (categoryFilter !== 'all') {
            filtered = filtered.filter(c => c.category === categoryFilter);
        }

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
        link.download = `smartcityai_complaints_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const getImageUrl = (c) => {
        if (c.imageUrl) return c.imageUrl;
        if (c.s3Key || (c.s3Keys && c.s3Keys.length > 0)) {
            const key = c.s3Key || c.s3Keys[0];
            return `https://civicai-uploads.s3.ap-south-1.amazonaws.com/${key}`;
        }
        return null;
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
                        {[
                            { key: 'all', label: 'Total', icon: <FileText size={18} />, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
                            { key: 'submitted', label: 'Submitted', icon: <Loader2 size={18} />, color: '#818CF8', bg: 'rgba(99,102,241,0.1)' },
                            { key: 'in_progress', label: 'In Progress', icon: <Clock size={18} />, color: '#60A5FA', bg: 'rgba(59,130,246,0.1)' },
                            { key: 'resolved', label: 'Resolved', icon: <CheckCircle size={18} />, color: '#34D399', bg: 'rgba(16,185,129,0.1)' },
                            { key: 'closed', label: 'Closed', icon: <AlertTriangle size={18} />, color: '#9CA3AF', bg: 'rgba(107,114,128,0.1)' },
                        ].map(s => (
                            <div key={s.key} className={`status-summary-card ${statusFilter === s.key ? 'active' : ''}`} onClick={() => setStatusFilter(s.key)}>
                                <div className="ssc-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
                                <div><span className="ssc-value">{statusCounts[s.key]}</span><span className="ssc-label">{s.label}</span></div>
                            </div>
                        ))}
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
                    </div>
                    {/* Category Filters */}
                    {categories.length > 0 && (
                        <div className="ac-filters" style={{ marginTop: '8px' }}>
                            <span className="filter-label">Category:</span>
                            <button
                                className={`filter-chip ${categoryFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setCategoryFilter('all')}
                            >
                                All
                            </button>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    className={`filter-chip ${categoryFilter === cat ? 'active' : ''}`}
                                    onClick={() => setCategoryFilter(cat)}
                                >
                                    {cat.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                </button>
                            ))}
                        </div>
                    )}
                    <span className="results-count text-muted text-sm" style={{ marginTop: '8px' }}>
                        Showing {displayedComplaints.length} of {complaints.length} results
                    </span>
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
                                    <th style={{ width: '40px' }}></th>
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
                                    <>
                                        <tr key={c.incident_id} className={expandedId === c.incident_id ? 'expanded-row' : ''}>
                                            <td>
                                                <button
                                                    className="expand-btn"
                                                    onClick={() => setExpandedId(expandedId === c.incident_id ? null : c.incident_id)}
                                                >
                                                    {expandedId === c.incident_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                            </td>
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
                                        {/* Expanded Row */}
                                        {expandedId === c.incident_id && (
                                            <tr key={`${c.incident_id}-expanded`} className="expanded-detail-row">
                                                <td colSpan={10}>
                                                    <div className="expanded-content">
                                                        <div className="expanded-left">
                                                            {getImageUrl(c) && (
                                                                <div className="expanded-image">
                                                                    <img src={getImageUrl(c)} alt="Complaint" loading="lazy" />
                                                                </div>
                                                            )}
                                                            {!getImageUrl(c) && (
                                                                <div className="expanded-no-image">
                                                                    <Image size={24} />
                                                                    <span>No image</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="expanded-right">
                                                            <div className="expanded-field">
                                                                <span className="expanded-label">AI Description</span>
                                                                <p>{c.aiDescription || c.description || 'No description available'}</p>
                                                            </div>
                                                            <div className="expanded-meta">
                                                                <div className="expanded-field">
                                                                    <span className="expanded-label">Priority Score</span>
                                                                    <PriorityBar score={c.priorityScore || 0} />
                                                                </div>
                                                                <div className="expanded-field">
                                                                    <span className="expanded-label">Full Address</span>
                                                                    <p>{c.address || 'N/A'}</p>
                                                                </div>
                                                                <div className="expanded-field">
                                                                    <span className="expanded-label">Confidence</span>
                                                                    <p>{c.confidence ? Math.round(c.confidence * 100) + '%' : 'N/A'}</p>
                                                                </div>
                                                            </div>
                                                            <Link to={`/complaint/${c.incident_id}`} className="btn btn-sm btn-primary" style={{ marginTop: '8px' }}>
                                                                View Full Details
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
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
