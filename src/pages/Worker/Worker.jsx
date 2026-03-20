import { useState, useEffect } from 'react';
import { MapPin, Navigation, CheckCircle, Loader2, Wrench, Clock, AlertTriangle, Camera, ArrowLeft, Filter } from 'lucide-react';
import { getWorkerAssignments, updateComplaintStatus, getComplaints } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, PriorityBar, Loader, TimeAgo } from '../../components/Shared/Shared';
import './Worker.css';

const SLABadge = ({ timestamp }) => {
    const now = new Date();
    const filed = new Date(timestamp);
    const hoursElapsed = Math.max(0, (now - filed) / (1000 * 60 * 60));
    const daysElapsed = Math.floor(hoursElapsed / 24);
    const hours = Math.floor(hoursElapsed % 24);

    let level = 'green';
    let label = `${daysElapsed}d ${hours}h`;
    if (hoursElapsed < 24) {
        label = `${Math.floor(hoursElapsed)}h`;
    }
    if (daysElapsed >= 3) level = 'red';
    else if (daysElapsed >= 1) level = 'yellow';

    return (
        <span className={`sla-badge sla-${level}`} title={`Filed ${daysElapsed} days ago`}>
            <Clock size={12} /> {label}
        </span>
    );
};

const Worker = () => {
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [notes, setNotes] = useState('');
    const [newStatus, setNewStatus] = useState('');
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        const fetchAssignments = async () => {
            try {
                const res = await getWorkerAssignments();
                setAssignments(res.assignments || []);
            } catch {
                // fallback: get all complaints with in_progress or assigned
                const res = await getComplaints();
                const filtered = (res.complaints || []).filter(c =>
                    ['assigned', 'in_progress', 'submitted'].includes(c.status)
                );
                setAssignments(filtered);
            }
            setLoading(false);
        };
        fetchAssignments();
    }, []);

    const handleUpdate = async () => {
        if (!newStatus) return;
        setUpdating(true);
        await updateComplaintStatus(selected.incident_id, newStatus, notes);
        setAssignments((prev) =>
            prev.map((a) => (a.incident_id === selected.incident_id ? { ...a, status: newStatus } : a))
        );
        setSelected(null);
        setNotes('');
        setNewStatus('');
        setUpdating(false);
    };

    const openGoogleMaps = (complaint) => {
        const lat = complaint.latitude || complaint.location?.lat;
        const lng = complaint.longitude || complaint.location?.lng;
        if (lat && lng) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
        } else if (complaint.address) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(complaint.address)}`, '_blank');
        }
    };

    const filteredAssignments = assignments.filter(a => {
        if (filter === 'all') return true;
        return a.status === filter;
    });

    const counts = {
        all: assignments.length,
        submitted: assignments.filter(a => a.status === 'submitted').length,
        assigned: assignments.filter(a => a.status === 'assigned').length,
        in_progress: assignments.filter(a => a.status === 'in_progress').length,
        resolved: assignments.filter(a => a.status === 'resolved').length,
    };

    if (loading) return <div className="worker-page"><Loader size="lg" text="Loading assignments..." /></div>;

    return (
        <div className="worker-page">
            <div className="container">
                <div className="worker-header">
                    <div>
                        <h1 className="section-title">My Assignments</h1>
                        <p className="text-muted text-sm">{assignments.length} total assignment(s)</p>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="worker-filter-tabs">
                    {[
                        { key: 'all', label: 'All' },
                        { key: 'submitted', label: 'New' },
                        { key: 'assigned', label: 'Assigned' },
                        { key: 'in_progress', label: 'In Progress' },
                        { key: 'resolved', label: 'Resolved' },
                    ].map(f => (
                        <button
                            key={f.key}
                            className={`filter-tab ${filter === f.key ? 'active' : ''}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                            <span className="filter-count">{counts[f.key]}</span>
                        </button>
                    ))}
                </div>

                {!selected ? (
                    <div className="worker-list">
                        {filteredAssignments.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                                <Filter size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                                <p>No assignments match this filter.</p>
                            </div>
                        ) : (
                            filteredAssignments.map((a) => (
                                <div key={a.incident_id} className="worker-card card card-glow" onClick={() => setSelected(a)}>
                                    <div className="wc-top">
                                        <div className="wc-top-left">
                                            <code className="wc-id">{a.incident_id?.split('-').pop()}</code>
                                            <StatusBadge status={a.status} />
                                            <SLABadge timestamp={a.timestamp || a.createdAt} />
                                        </div>
                                        <SeverityBadge severity={a.severity} />
                                    </div>
                                    <CategoryTag category={a.category} />
                                    <p className="wc-desc">{a.aiDescription || a.description}</p>
                                    <div className="wc-bottom">
                                        <span className="wc-loc"><MapPin size={13} /> {(a.address || '').split(',')[0]}</span>
                                        <PriorityBar score={a.priorityScore} />
                                    </div>
                                    <div className="wc-actions">
                                        <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openGoogleMaps(a); }}>
                                            <Navigation size={14} /> Navigate
                                        </button>
                                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSelected(a); }}>
                                            Update Status
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="worker-detail animate-fade-in">
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: 'var(--space-lg)' }}>
                            <ArrowLeft size={14} /> Back to List
                        </button>
                        <div className="card">
                            <div className="wc-top">
                                <div className="wc-top-left">
                                    <code className="wc-id">{selected.incident_id}</code>
                                    <StatusBadge status={selected.status} />
                                    <SLABadge timestamp={selected.timestamp || selected.createdAt} />
                                </div>
                                <SeverityBadge severity={selected.severity} />
                            </div>
                            <CategoryTag category={selected.category} />
                            <p className="detail-desc" style={{ margin: 'var(--space-md) 0' }}>{selected.aiDescription || selected.description}</p>

                            {/* Image Preview */}
                            {selected.imageUrl && (
                                <div className="worker-image-preview">
                                    <img src={selected.imageUrl} alt="Complaint" />
                                </div>
                            )}

                            <div className="detail-location">
                                <MapPin size={16} />
                                <span>{selected.address}</span>
                                <button className="btn btn-sm btn-secondary" onClick={() => openGoogleMaps(selected)} style={{ marginLeft: 'auto' }}>
                                    <Navigation size={14} /> Get Directions
                                </button>
                            </div>

                            {/* Priority Info */}
                            <div className="worker-priority-info">
                                <div className="priority-item">
                                    <span className="priority-label">Priority Score</span>
                                    <PriorityBar score={selected.priorityScore || 0} />
                                </div>
                                <div className="priority-item">
                                    <span className="priority-label">Department</span>
                                    <span className="priority-value">{selected.department || 'Unassigned'}</span>
                                </div>
                                <div className="priority-item">
                                    <span className="priority-label">Reported By</span>
                                    <span className="priority-value">{selected.user_name || selected.user_phone || 'Unknown'}</span>
                                </div>
                            </div>

                            <div className="wc-update card" style={{ background: 'var(--bg-primary)' }}>
                                <h3 style={{ marginBottom: 'var(--space-md)' }}>Update Status</h3>
                                <div className="status-options">
                                    {[
                                        { value: 'in_progress', icon: <Wrench size={14} />, label: 'In Progress' },
                                        { value: 'resolved', icon: <CheckCircle size={14} />, label: 'Resolved' },
                                    ].map((s) => (
                                        <label key={s.value} className={`status-radio ${newStatus === s.value ? 'active' : ''}`}>
                                            <input type="radio" name="status" value={s.value} checked={newStatus === s.value} onChange={() => setNewStatus(s.value)} />
                                            {s.icon} <span>{s.label}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="input-group">
                                    <label>Resolution Notes</label>
                                    <textarea className="input" placeholder="Describe the work done or issue found on site..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                                </div>
                                <button className="btn btn-success" style={{ marginTop: 'var(--space-md)', width: '100%' }} onClick={handleUpdate} disabled={!newStatus || updating}>
                                    {updating ? <><Loader2 size={16} className="spin-icon" /> Updating...</> : <><CheckCircle size={16} /> Update Complaint</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Worker;
