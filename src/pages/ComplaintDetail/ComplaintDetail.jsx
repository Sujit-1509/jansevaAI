import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, ThumbsUp, Share2, Clock, User } from 'lucide-react';
import { getComplaintById, updateComplaintStatus, upvoteComplaint } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, PriorityBar, Loader, TimeAgo } from '../../components/Shared/Shared';
import './ComplaintDetail.css';
const ComplaintDetail = () => {
    const { id } = useParams();
    const [complaint, setComplaint] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const user = JSON.parse(localStorage.getItem('jansevaai_user') || '{}');
    const canUpdateStatus = user.role === 'admin' || user.role === 'worker';
    const backLink = canUpdateStatus ? '/complaints' : '/my-complaints';

    const [upvotes, setUpvotes] = useState(0);
    const [hasUpvoted, setHasUpvoted] = useState(false);

    useEffect(() => {
        getComplaintById(id).then((res) => {
            const data = res.complaint || res;
            setComplaint(data);
            setUpvotes(data.upvotes || 0);
            setLoading(false);
        });
    }, [id]);
    if (loading) return <div className="detail-page"><Loader size="lg" text="Loading complaint..." /></div>;
    if (!complaint || complaint.error) return <div className="detail-page"><div className="container"><p>Complaint not found.</p></div></div>;
    const c = complaint;
    const confidenceVal = parseFloat(c.confidence) || 0;
    const imageUrl = c.s3_key
        ? `https://civicai-images.s3.ap-south-1.amazonaws.com/${c.s3_key}`
        : null;

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

    const handleStatusChange = async (e) => {
        const newStatus = e.target.value;
        setUpdatingStatus(true);
        try {
            const res = await updateComplaintStatus(c.incident_id || c.id, newStatus, "Status updated from detail page");
            if (res.success) {
                setComplaint({ ...c, status: newStatus });
            } else {
                alert('Failed to update status');
            }
        } catch (error) {
            console.error(error);
            alert('Error updating status');
        } finally {
            setUpdatingStatus(false);
        }
    };

    return (
        <div className="detail-page">
            <div className="container">
                <Link to={backLink} className="back-link"><ArrowLeft size={16} /> Back to Complaints</Link>
                <div className="detail-grid">
                    <div className="detail-main">
                        <div className="card">
                            <div className="detail-top">
                                <code className="detail-id">{c.incident_id || c.id}</code>
                                {canUpdateStatus ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {updatingStatus && <Loader text="" />}
                                        <select
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '20px',
                                                border: '1px solid var(--border-color)',
                                                fontSize: '0.85rem',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                backgroundColor: 'var(--surface-color)',
                                                outline: 'none'
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
                                <div style={{ margin: 'var(--space-md) 0', borderRadius: '12px', overflow: 'hidden' }}>
                                    <img
                                        src={imageUrl}
                                        alt="Complaint"
                                        style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', borderRadius: '12px' }}
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
                                    <span className="detail-stat-val" style={{ color: 'var(--success)' }}>{Math.round(confidenceVal * 100)}%</span>
                                </div>
                                <div className="detail-stat">
                                    <span className="detail-stat-label">Department</span>
                                    <span className="detail-stat-val">{c.department}</span>
                                </div>
                            </div>
                            {c.user_note && (
                                <div style={{ marginTop: 'var(--space-sm)' }}>
                                    <span className="detail-stat-label">User Notes</span>
                                    <p className="detail-desc">{c.user_note}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="detail-sidebar">
                        <div className="card">
                            <h3 className="sidebar-title"><Clock size={16} /> Info</h3>
                            {c.timestamp && (
                                <p className="text-sm text-muted">Submitted: <TimeAgo date={c.timestamp} /></p>
                            )}
                            {c.user_name && (
                                <p className="text-sm" style={{ marginTop: '8px' }}>
                                    <User size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                    Reported by: <strong>{c.user_name}</strong>
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
