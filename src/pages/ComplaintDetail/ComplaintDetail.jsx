import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, ThumbsUp, Share2, Clock, User, CheckCircle, Camera, Trash2, X, AlertCircle } from 'lucide-react';
import { getComplaintById, updateComplaintStatus, upvoteComplaint, deleteComplaint } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, PriorityBar, Loader, TimeAgo } from '../../components/Shared/Shared';
import './ComplaintDetail.css';

const S3_BASE = 'https://civicai-images.s3.ap-south-1.amazonaws.com/';

// Maps a status string to a timeline dot color
function timelineDotColor(status) {
    const map = {
        submitted:   'var(--color-text-secondary)',
        assigned:    'var(--color-text-info)',
        in_progress: 'var(--color-text-warning)',
        resolved:    'var(--color-text-success)',
        closed:      'var(--color-text-success)',
        accepted:    'var(--color-text-success)',
        rejected:    'var(--color-text-danger)',
        updated:     'var(--color-text-secondary)',
    };
    return map[status] || 'var(--color-text-tertiary)';
}

function TimelineEntry({ entry, isLast }) {
    const color = timelineDotColor(entry.status || entry.worker_action || 'updated');
    const label = entry.worker_action
        ? `Worker ${entry.worker_action}`
        : (entry.status || 'updated').replace('_', ' ');

    return (
        <div className="timeline-entry">
            <div className="timeline-line-wrap">
                <div className="timeline-dot" style={{ background: color }} />
                {!isLast && <div className="timeline-connector" />}
            </div>
            <div className="timeline-content">
                <div className="timeline-row">
                    <span className="timeline-status" style={{ color }}>{label}</span>
                    <span className="timeline-time">
                        {entry.timestamp
                            ? new Date(entry.timestamp).toLocaleString('en-IN', {
                                day: '2-digit', month: 'short',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '—'}
                    </span>
                </div>
                {entry.actor && (
                    <div className="timeline-actor">
                        <User size={11} /> {entry.actor.includes('+91') ? entry.actor.slice(-4).padStart(10,'*') : entry.actor}
                    </div>
                )}
                {entry.note && <p className="timeline-note">{entry.note}</p>}
                {entry.proof_s3_key && (
                    <a
                        className="timeline-proof-link"
                        href={`${S3_BASE}${entry.proof_s3_key}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Camera size={12} /> View resolution photo
                    </a>
                )}
            </div>
        </div>
    );
}

const ComplaintDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [complaint,      setComplaint]      = useState(null);
    const [loading,        setLoading]        = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [upvotes,        setUpvotes]        = useState(0);
    const [hasUpvoted,     setHasUpvoted]     = useState(false);
    const [toast,          setToast]          = useState(null);

    const user = JSON.parse(localStorage.getItem('jansevaai_user') || '{}');
    const canUpdateStatus = user.role === 'admin' || user.role === 'worker';
    const backLink = canUpdateStatus ? '/complaints' : '/my-complaints';

    useEffect(() => {
        getComplaintById(id).then(res => {
            const data = res.complaint || res;
            setComplaint(data);
            setUpvotes(data.upvotes || 0);
            setLoading(false);
        });
    }, [id]);

    if (loading)
        return <div className="detail-page"><Loader size="lg" text="Loading complaint..." /></div>;
    if (!complaint || complaint.error)
        return <div className="detail-page"><div className="container"><p>Complaint not found.</p></div></div>;

    const c             = complaint;
    const confidenceVal = parseFloat(c.confidence) || 0;
    const imageUrl      = c.s3_key ? `${S3_BASE}${c.s3_key}` : null;
    const proofUrl      = c.resolution_proof_key ? `${S3_BASE}${c.resolution_proof_key}` : null;

    const uPhone = String(user.phone || user.userPhone || '').trim();
    const cPhone = String(c.user_phone || c.userPhone || '').trim();
    const isOwner = (user.role === 'admin') || 
                    (uPhone && cPhone && (cPhone.includes(uPhone) || uPhone.includes(cPhone))) ||
                    (user.name && c.user_name && user.name === c.user_name);

    // Build timeline: inject the initial "submitted" entry if status_history is empty
    const rawHistory    = Array.isArray(c.status_history) ? c.status_history : [];
    const timeline      = rawHistory.length > 0
        ? rawHistory
        : [{ status: c.status || 'submitted', timestamp: c.timestamp, actor: c.user_phone || 'citizen', note: 'Complaint submitted' }];

    const handleUpvote = async () => {
        if (hasUpvoted) return;
        try {
            const res = await upvoteComplaint(c.incident_id || c.id);
            setUpvotes(res.upvotes || upvotes + 1);
            setHasUpvoted(true);
        } catch (err) {
            console.error('Upvote failed', err);
        }
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    };

    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to delete this complaint? This cannot be undone.")) {
            try {
                const res = await deleteComplaint(c.incident_id || c.id);
                if (res.success) {
                    navigate(backLink);
                } else {
                    showToast('Failed to delete complaint from server.');
                }
            } catch (err) {
                console.error('Delete failed:', err);
                showToast('Error deleting complaint.');
            }
        }
    };

    const handleStatusChange = async e => {
        const newStatus = e.target.value;
        setUpdatingStatus(true);
        try {
            const res = await updateComplaintStatus(c.incident_id || c.id, newStatus, 'Status updated from detail page');
            if (res.success) {
                setComplaint(prev => ({
                    ...prev,
                    status: newStatus,
                    status_history: [
                        ...(prev.status_history || []),
                        {
                            status:    newStatus,
                            timestamp: new Date().toISOString(),
                            actor:     user.phone || user.role || 'admin',
                            note:      'Status updated from detail page',
                        },
                    ],
                }));
            } else {
                showToast('Failed to update status');
            }
        } catch (error) {
            console.error(error);
            showToast('Error updating status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    return (
        <div className="detail-page">
            <div className="container">
                {toast && (
                    <div style={{ background: 'var(--bg-danger, #fef2f2)', color: 'var(--color-text-danger, #dc2626)', border: '1px solid var(--border-danger, #fecaca)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', fontWeight: 500 }}>
                        <AlertCircle size={16} />
                        <span style={{ flex: 1 }}>{toast}</span>
                        <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}><X size={14} /></button>
                    </div>
                )}
                <Link to={backLink} className="back-link"><ArrowLeft size={16} /> Back to Complaints</Link>

                <div className="detail-grid">
                    {/* ── Main panel ───────────────────────────────────────── */}
                    <div className="detail-main">
                        <div className="card">
                            <div className="detail-top">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <code className="detail-id">{c.incident_id || c.id}</code>
                                    {isOwner && (
                                        <button 
                                            onClick={handleDelete}
                                            style={{ padding: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            title="Delete Complaint"
                                        >
                                            <Trash2 size={16} color="var(--danger)" />
                                        </button>
                                    )}
                                </div>
                                {canUpdateStatus ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {updatingStatus && <Loader text="" />}
                                        <select
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 20,
                                                border: '1px solid var(--border-medium)',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                backgroundColor: 'var(--bg-card)',
                                                outline: 'none',
                                            }}
                                            value={c.status || 'submitted'}
                                            onChange={handleStatusChange}
                                            disabled={updatingStatus}
                                        >
                                            <option value="submitted">Submitted</option>
                                            <option value="assigned">Assigned</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="resolved">Resolved</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>
                                ) : (
                                    <StatusBadge status={c.status} />
                                )}
                            </div>

                            <div className="detail-meta-row">
                                <CategoryTag category={c.category} />
                                <SeverityBadge severity={c.severity} />
                            </div>

                            {imageUrl && (
                                <div style={{ margin: 'var(--space-md) 0', borderRadius: 12, overflow: 'hidden' }}>
                                    <img
                                        src={imageUrl}
                                        alt="Complaint"
                                        style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderRadius: 12 }}
                                    />
                                </div>
                            )}

                            <p className="detail-desc">{c.description}</p>

                            {c.address && (
                                <div className="detail-location">
                                    <MapPin size={16} />
                                    <span>{c.address}</span>
                                </div>
                            )}

                            <div className="detail-stats-row">
                                <div className="detail-stat">
                                    <span className="detail-stat-label">Confidence</span>
                                    <span className="detail-stat-val" style={{ color: 'var(--success)' }}>
                                        {Math.round(confidenceVal * 100)}%
                                    </span>
                                </div>
                                <div className="detail-stat">
                                    <span className="detail-stat-label">Department</span>
                                    <span className="detail-stat-val">{c.department}</span>
                                </div>
                                {c.priorityScore != null && (
                                    <div className="detail-stat">
                                        <span className="detail-stat-label">Priority score</span>
                                        <span className="detail-stat-val">{c.priorityScore}/100</span>
                                    </div>
                                )}
                            </div>

                            {c.sla_deadline && (
                                <div className="sla-detail-row">
                                    <Clock size={13} />
                                    <span>SLA deadline: </span>
                                    <strong>{new Date(c.sla_deadline).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>
                                    {new Date(c.sla_deadline) < new Date() && !['resolved','closed'].includes(c.status) && (
                                        <span className="sla-overdue-tag">Overdue</span>
                                    )}
                                </div>
                            )}

                            {c.user_note && (
                                <div style={{ marginTop: 'var(--space-sm)' }}>
                                    <span className="detail-stat-label">User notes</span>
                                    <p className="detail-desc">{c.user_note}</p>
                                </div>
                            )}

                            {/* Resolution proof photo */}
                            {proofUrl && (
                                <div className="proof-section">
                                    <div className="proof-header">
                                        <Camera size={14} />
                                        <span>Resolution photo proof</span>
                                    </div>
                                    <img
                                        src={proofUrl}
                                        alt="Resolution proof"
                                        style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* ── Status timeline ─────────────────────────────── */}
                        <div className="card" style={{ marginTop: 'var(--space-md)' }}>
                            <h3 className="sidebar-title"><Clock size={16} /> Status timeline</h3>
                            <div className="timeline">
                                {timeline.map((entry, i) => (
                                    <TimelineEntry
                                        key={i}
                                        entry={entry}
                                        isLast={i === timeline.length - 1}
                                    />
                                ))}
                            </div>
                            {timeline.length === 0 && (
                                <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>No history yet.</p>
                            )}
                        </div>
                    </div>

                    {/* ── Sidebar ──────────────────────────────────────────── */}
                    <div className="detail-sidebar">
                        <div className="card">
                            <h3 className="sidebar-title"><Clock size={16} /> Info</h3>
                            {c.timestamp && (
                                <p className="text-sm text-muted">Submitted: <TimeAgo date={c.timestamp} /></p>
                            )}
                            {c.user_name && (
                                <p className="text-sm" style={{ marginTop: 8 }}>
                                    <User size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    Reported by: <strong>{c.user_name}</strong>
                                </p>
                            )}
                            {c.assigned_to_name && (
                                <p className="text-sm" style={{ marginTop: 8 }}>
                                    <CheckCircle size={14} style={{ marginRight: 4, verticalAlign: 'middle', color: 'var(--color-text-info)' }} />
                                    Assigned to: <strong>{c.assigned_to_name}</strong>
                                </p>
                            )}
                        </div>

                        <div className="card" style={{ marginTop: 'var(--space-md)' }}>
                            <h3 className="sidebar-title"><ThumbsUp size={16} /> Community</h3>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                                <button
                                    className={`btn ${hasUpvoted ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={handleUpvote}
                                    style={{ flex: 1 }}
                                    disabled={hasUpvoted}
                                >
                                    <ThumbsUp size={14} /> {hasUpvoted ? 'Upvoted' : 'Upvote'} ({upvotes})
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigator.clipboard.writeText(window.location.href)}
                                    title="Copy link"
                                >
                                    <Share2 size={14} /> Share
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ComplaintDetail;
