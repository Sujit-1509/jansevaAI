import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ThumbsUp } from 'lucide-react';
import { getComplaints } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, TimeAgo, Loader, EmptyState, PriorityBar } from '../../components/Shared/Shared';
import './MyComplaints.css';
const MyComplaints = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    useEffect(() => {
        const savedUser = JSON.parse(localStorage.getItem('civicai_user') || '{}');
        const f = filter === 'all' ? {} : { status: filter };
        if (savedUser.phone) {
            f.phone = savedUser.phone;
        }
        setLoading(true);
        getComplaints(f).then((res) => {
            setComplaints(res.complaints || []);
            setLoading(false);
        });
    }, [filter]);
    return (
        <div className="my-complaints-page">
            <div className="container">
                <div className="mc-header">
                    <h1 className="section-title">My Complaints</h1>
                    <Link to="/submit" className="btn btn-primary btn-sm">+ Report New</Link>
                </div>
                <div className="mc-filters">
                    {['all', 'submitted', 'assigned', 'in_progress', 'resolved', 'closed'].map((s) => (
                        <button
                            key={s}
                            className={`filter-chip ${filter === s ? 'active' : ''}`}
                            onClick={() => setFilter(s)}
                        >
                            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </button>
                    ))}
                </div>
                {loading ? (
                    <Loader text="Loading complaints..." />
                ) : complaints.length === 0 ? (
                    <EmptyState
                        icon={<ClipboardList size={32} />}
                        title="No complaints found"
                        description="You haven't submitted any complaints yet."
                        action={<Link to="/submit" className="btn btn-primary">Report an Issue</Link>}
                    />
                ) : (
                    <div className="mc-list">
                        {complaints.map((c) => (
                            <Link key={c.incident_id} to={`/complaint/${c.incident_id}`} className="mc-card card card-glow">
                                <div className="mc-card-top">
                                    <code className="mc-id">{c.incident_id}</code>
                                    <StatusBadge status={c.status} />
                                </div>
                                <div className="mc-card-body">
                                    <CategoryTag category={c.category} />
                                    <p className="mc-desc">{c.description}</p>
                                </div>
                                <div className="mc-card-meta">
                                    <div className="mc-prio">
                                        <span className="text-sm text-muted">Priority</span>
                                        <PriorityBar score={c.priorityScore} />
                                    </div>
                                    <div className="mc-info">
                                        <SeverityBadge severity={c.severity} />
                                        <span className="mc-upvotes"><ThumbsUp size={12} /> {c.upvotes || 0}</span>
                                        <TimeAgo date={c.timestamp} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
export default MyComplaints;
