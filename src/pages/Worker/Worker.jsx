import { useState, useEffect } from 'react';
import { MapPin, Navigation, CheckCircle, Loader2, Wrench } from 'lucide-react';
import { getWorkerAssignments, updateComplaintStatus } from '../../services/api';
import { StatusBadge, SeverityBadge, CategoryTag, PriorityBar, Loader, TimeAgo } from '../../components/Shared/Shared';
import './Worker.css';
const Worker = () => {
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [updating, setUpdating] = useState(false);
    const [notes, setNotes] = useState('');
    const [newStatus, setNewStatus] = useState('');
    useEffect(() => {
        getWorkerAssignments().then((res) => {
            setAssignments(res.assignments);
            setLoading(false);
        });
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
    if (loading) return <div className="worker-page"><Loader size="lg" text="Loading assignments..." /></div>;
    return (
        <div className="worker-page">
            <div className="container">
                <div className="worker-header">
                    <div>
                        <h1 className="section-title">My Assignments</h1>
                        <p className="text-muted text-sm">{assignments.length} active assignment(s)</p>
                    </div>
                </div>
                {!selected ? (
                    <div className="worker-list">
                        {assignments.map((a) => (
                            <div key={a.incident_id} className="worker-card card card-glow" onClick={() => setSelected(a)}>
                                <div className="wc-top">
                                    <div>
                                        <code className="wc-id">{a.incident_id}</code>
                                        <StatusBadge status={a.status} />
                                    </div>
                                    <SeverityBadge severity={a.severity} />
                                </div>
                                <CategoryTag category={a.category} />
                                <p className="wc-desc">{a.description}</p>
                                <div className="wc-bottom">
                                    <span className="wc-loc"><MapPin size={13} /> {a.address.split(',')[0]}</span>
                                    <PriorityBar score={a.priorityScore} />
                                </div>
                                <div className="wc-actions">
                                    <button className="btn btn-sm btn-secondary"><Navigation size={14} /> Navigate</button>
                                    <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setSelected(a); }}>Update Status</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="worker-detail animate-fade-in">
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: 'var(--space-lg)' }}>
                            Back to List
                        </button>
                        <div className="card">
                            <div className="wc-top">
                                <code className="wc-id">{selected.incident_id}</code>
                                <StatusBadge status={selected.status} />
                            </div>
                            <CategoryTag category={selected.category} />
                            <p className="detail-desc" style={{ margin: 'var(--space-md) 0' }}>{selected.aiDescription || selected.description}</p>
                            <div className="detail-location">
                                <MapPin size={16} />
                                <span>{selected.address}</span>
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
                                    <label>Notes</label>
                                    <textarea className="input" placeholder="Add resolution notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
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
