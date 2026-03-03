import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, ThumbsUp, Share2, Clock, User } from 'lucide-react';
import { getComplaintById } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, PriorityBar, Loader, TimeAgo } from '../../components/Shared/Shared';
import './ComplaintDetail.css';
const ComplaintDetail = () => {
    const { id } = useParams();
    const [complaint, setComplaint] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        getComplaintById(id).then((res) => {
            // The Lambda returns the item at top-level (res itself)
            // or wrapped as res.complaint from mock data
            const data = res.complaint || res;
            setComplaint(data);
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
    return (
        <div className="detail-page">
            <div className="container">
                <Link to="/my-complaints" className="back-link"><ArrowLeft size={16} /> Back to Complaints</Link>
                <div className="detail-grid">
                    <div className="detail-main">
                        <div className="card">
                            <div className="detail-top">
                                <code className="detail-id">{c.incident_id || c.id}</code>
                                <StatusBadge status={c.status} />
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
                    </div>
                </div>
            </div>
        </div>
    );
};
export default ComplaintDetail;
