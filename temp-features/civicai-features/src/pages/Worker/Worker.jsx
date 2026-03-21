import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Camera, BarChart2, AlertTriangle, RefreshCw, X } from 'lucide-react';
import {
    getComplaints,
    workerRespondToTask,
    resolveWithProof,
    updateComplaintStatus,
    getWorkerStats,
} from '../../services/api';
import './Worker.css';

function slaStatus(c) {
    if (!c.sla_deadline) return null;
    const ms = new Date(c.sla_deadline).getTime() - Date.now();
    if (ms < 0) return { text: `${Math.round(-ms/3600000)}h overdue`, cls: 'sla-breach', urgent: true };
    if (ms < 6*3600000) return { text: `${Math.round(ms/3600000)}h left`, cls: 'sla-warn', urgent: true };
    const days = Math.floor(ms / 86400000);
    const hrs  = Math.floor((ms % 86400000) / 3600000);
    return { text: days > 0 ? `${days}d ${hrs}h` : `${hrs}h`, cls: 'sla-ok', urgent: false };
}

function StatusBadge({ status }) {
    const map = { assigned: 'badge-info', in_progress: 'badge-warning', resolved: 'badge-success', submitted: 'badge-muted' };
    return <span className={`badge ${map[status] || 'badge-muted'}`}>{status?.replace('_',' ')}</span>;
}

export default function Worker({ user }) {
    const navigate    = useNavigate();
    const workerPhone = user?.phone || '';

    // ── Data ──────────────────────────────────────────────────────────────────
    const [tasks,   setTasks]   = useState([]);
    const [stats,   setStats]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [view,    setView]    = useState('tasks'); // 'tasks' | 'stats'

    // ── Resolve with proof modal ──────────────────────────────────────────────
    const [resolveModal, setResolveModal] = useState(null);
    const [proofFile,    setProofFile]    = useState(null);
    const [proofNote,    setProofNote]    = useState('');
    const [resolveLoading, setResolveLoading] = useState(false);
    const fileRef = useRef(null);

    // ── Toast ─────────────────────────────────────────────────────────────────
    const [toast, setToast] = useState('');
    const timerRef = useRef(null);
    function showToast(msg) {
        setToast(msg);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setToast(''), 3000);
    }

    // ── Load ──────────────────────────────────────────────────────────────────
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [complRes, statsRes] = await Promise.all([
                getComplaints(),
                getWorkerStats(workerPhone),
            ]);
            const all   = complRes.complaints || [];
            const mine  = workerPhone
                ? all.filter(c => c.assigned_to === workerPhone)
                : all.filter(c => ['assigned','in_progress'].includes(c.status));
            // Sort: urgent SLA first, then by priority
            mine.sort((a, b) => {
                const aUrgent = a.sla_deadline && new Date(a.sla_deadline) < new Date() ? 1 : 0;
                const bUrgent = b.sla_deadline && new Date(b.sla_deadline) < new Date() ? 1 : 0;
                if (bUrgent !== aUrgent) return bUrgent - aUrgent;
                return (b.priorityScore || 0) - (a.priorityScore || 0);
            });
            setTasks(mine);
            setStats(statsRes);
        } finally {
            setLoading(false);
        }
    }, [workerPhone]);

    useEffect(() => { load(); }, [load]);

    // ── Accept / reject ───────────────────────────────────────────────────────
    async function handleRespond(task, action) {
        try {
            await workerRespondToTask(task.incident_id, action, '');
            setTasks(prev => prev.map(t =>
                t.incident_id === task.incident_id
                    ? { ...t, status: action === 'accepted' ? 'in_progress' : 'submitted', worker_action: action }
                    : t
            ));
            showToast(action === 'accepted' ? 'Task accepted — marked in progress' : 'Task rejected');
        } catch {
            showToast('Failed to respond to task');
        }
    }

    // ── Resolve (simple, no photo) ────────────────────────────────────────────
    async function handleSimpleResolve(task) {
        try {
            await updateComplaintStatus(task.incident_id, 'resolved', 'Resolved by worker');
            setTasks(prev => prev.map(t =>
                t.incident_id === task.incident_id ? { ...t, status: 'resolved' } : t
            ));
            showToast('Marked as resolved');
        } catch {
            showToast('Failed to resolve');
        }
    }

    // ── Resolve with proof ────────────────────────────────────────────────────
    async function handleResolveWithProof() {
        if (!resolveModal) return;
        setResolveLoading(true);
        try {
            if (proofFile) {
                await resolveWithProof(resolveModal.incident_id, proofFile, proofNote || 'Resolved with photo proof');
            } else {
                await updateComplaintStatus(resolveModal.incident_id, 'resolved', proofNote || 'Resolved');
            }
            setTasks(prev => prev.map(t =>
                t.incident_id === resolveModal.incident_id
                    ? { ...t, status: 'resolved', resolution_proof_key: proofFile ? 'uploaded' : null }
                    : t
            ));
            showToast(proofFile ? 'Resolved with photo proof uploaded' : 'Marked as resolved');
            setResolveModal(null);
            setProofFile(null);
            setProofNote('');
        } catch {
            showToast('Failed to resolve');
        } finally {
            setResolveLoading(false);
        }
    }

    const activeTasks   = tasks.filter(t => ['assigned','in_progress'].includes(t.status));
    const resolvedTasks = tasks.filter(t => ['resolved','closed'].includes(t.status));

    return (
        <div className="worker-page">

            {/* ── Tab bar ───────────────────────────────────────────────────── */}
            <div className="worker-tabs">
                <button className={`worker-tab ${view === 'tasks' ? 'active' : ''}`} onClick={() => setView('tasks')}>
                    My tasks
                    {activeTasks.length > 0 && <span className="tab-badge">{activeTasks.length}</span>}
                </button>
                <button className={`worker-tab ${view === 'stats' ? 'active' : ''}`} onClick={() => setView('stats')}>
                    My stats
                </button>
                <button className="worker-tab-refresh" onClick={load}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {loading && <div className="worker-loading">Loading…</div>}

            {/* ── TASKS VIEW ───────────────────────────────────────────────── */}
            {!loading && view === 'tasks' && (
                <div className="tasks-view">

                    {activeTasks.length === 0 && (
                        <div className="worker-empty">
                            <CheckCircle size={32} style={{ opacity: .3 }} />
                            <p>No active tasks assigned to you</p>
                        </div>
                    )}

                    {activeTasks.map(task => {
                        const sla      = slaStatus(task);
                        const isNew    = task.status === 'assigned' && task.worker_action !== 'accepted';
                        const inProg   = task.status === 'in_progress';

                        return (
                            <div key={task.incident_id} className={`task-card ${sla?.urgent ? 'task-urgent' : ''}`}>
                                <div className="task-top">
                                    <div className="task-meta">
                                        <span className="task-id" onClick={() => navigate(`/complaint/${task.incident_id}`)}>
                                            {task.incident_id?.slice(0, 12)}…
                                        </span>
                                        <span className="task-cat">{(task.category || 'unknown').replace('_',' ')}</span>
                                        <StatusBadge status={task.status} />
                                        {sla && (
                                            <span className={`sla-tag ${sla.cls}`}>
                                                <Clock size={11} style={{ verticalAlign: 'middle' }} />
                                                {' '}{sla.text}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`sev-badge sev-${task.severity}`}>{task.severity}</span>
                                </div>

                                {task.description && (
                                    <p className="task-desc">{task.description.slice(0, 160)}{task.description.length > 160 ? '…' : ''}</p>
                                )}

                                {task.address && (
                                    <p className="task-addr">{task.address}</p>
                                )}

                                <div className="task-priority-row">
                                    <span className="prio-label">Priority</span>
                                    <div className="prio-bar-bg">
                                        <div className="prio-bar-fill" style={{
                                            width: `${task.priorityScore || 0}%`,
                                            background: task.priorityScore > 70
                                                ? 'var(--color-text-danger)'
                                                : task.priorityScore > 40
                                                    ? 'var(--color-text-warning)'
                                                    : 'var(--color-text-info)',
                                        }} />
                                    </div>
                                    <span className="prio-val">{task.priorityScore || 0}</span>
                                </div>

                                {/* Action buttons */}
                                <div className="task-actions">
                                    {isNew && (
                                        <>
                                            <button className="btn-accept" onClick={() => handleRespond(task, 'accepted')}>
                                                <CheckCircle size={14} /> Accept
                                            </button>
                                            <button className="btn-reject" onClick={() => handleRespond(task, 'rejected')}>
                                                <XCircle size={14} /> Reject
                                            </button>
                                        </>
                                    )}
                                    {inProg && (
                                        <>
                                            <button className="btn-resolve" onClick={() => handleSimpleResolve(task)}>
                                                <CheckCircle size={14} /> Mark resolved
                                            </button>
                                            <button className="btn-proof" onClick={() => { setResolveModal(task); setProofFile(null); setProofNote(''); }}>
                                                <Camera size={14} /> Resolve with photo
                                            </button>
                                        </>
                                    )}
                                    <button className="btn-detail" onClick={() => navigate(`/complaint/${task.incident_id}`)}>
                                        View details
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {/* Recently resolved */}
                    {resolvedTasks.length > 0 && (
                        <div className="resolved-section">
                            <h4 className="section-title">Recently resolved ({resolvedTasks.length})</h4>
                            {resolvedTasks.slice(0, 5).map(task => (
                                <div key={task.incident_id} className="resolved-row" onClick={() => navigate(`/complaint/${task.incident_id}`)}>
                                    <span className="task-id">{task.incident_id?.slice(0, 12)}…</span>
                                    <span className="task-cat">{(task.category || '').replace('_',' ')}</span>
                                    {task.resolution_proof_key && (
                                        <span className="proof-tag"><Camera size={11} /> proof</span>
                                    )}
                                    <StatusBadge status={task.status} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── STATS VIEW ───────────────────────────────────────────────── */}
            {!loading && view === 'stats' && stats && (
                <div className="stats-view">
                    <div className="stats-grid">
                        {[
                            { label: 'Total assigned',  val: stats.total,    color: 'var(--color-text-primary)' },
                            { label: 'Resolved',        val: stats.resolved, color: 'var(--color-text-success)' },
                            { label: 'In progress',     val: stats.active,   color: 'var(--color-text-warning)' },
                            { label: 'Pending accept',  val: stats.pending,  color: 'var(--color-text-info)' },
                        ].map(s => (
                            <div key={s.label} className="stat-card">
                                <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
                                <div className="stat-label">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="stats-details">
                        <div className="detail-row">
                            <span className="detail-label">Avg resolution time</span>
                            <span className="detail-val">
                                {stats.avgResolutionHours ? `${stats.avgResolutionHours}h` : 'N/A'}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">SLA compliance</span>
                            <span className={`detail-val ${stats.slaComplianceRate >= 80 ? 'good' : 'low'}`}>
                                {stats.slaComplianceRate}%
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Rejected tasks</span>
                            <span className="detail-val">{stats.rejected}</span>
                        </div>
                    </div>

                    {/* SLA compliance bar */}
                    <div className="sla-bar-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>SLA compliance rate</span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{stats.slaComplianceRate}%</span>
                        </div>
                        <div className="sla-bar-bg">
                            <div
                                className="sla-bar-fill"
                                style={{
                                    width: `${stats.slaComplianceRate}%`,
                                    background: stats.slaComplianceRate >= 80
                                        ? 'var(--color-text-success)'
                                        : stats.slaComplianceRate >= 50
                                            ? 'var(--color-text-warning)'
                                            : 'var(--color-text-danger)',
                                }}
                            />
                        </div>
                    </div>

                    {stats.recentResolved.length > 0 && (
                        <div className="recent-resolved">
                            <h4 className="section-title">Recent resolutions</h4>
                            {stats.recentResolved.map(c => (
                                <div key={c.incident_id} className="resolved-row" onClick={() => navigate(`/complaint/${c.incident_id}`)}>
                                    <span className="task-id">{c.incident_id?.slice(0, 12)}…</span>
                                    <span className="task-cat">{(c.category || '').replace('_',' ')}</span>
                                    <StatusBadge status={c.status} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Resolve with proof modal ──────────────────────────────────── */}
            {resolveModal && (
                <div className="modal-backdrop" onClick={() => setResolveModal(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Resolve with photo proof</h3>
                            <button className="modal-close" onClick={() => setResolveModal(null)}><X size={16}/></button>
                        </div>
                        <p className="modal-sub">
                            {resolveModal.incident_id?.slice(0,12)}… &middot; {resolveModal.category?.replace('_',' ')}
                        </p>

                        {/* Photo upload */}
                        <div
                            className={`photo-drop ${proofFile ? 'has-file' : ''}`}
                            onClick={() => fileRef.current?.click()}
                        >
                            {proofFile
                                ? <><Camera size={16} /> {proofFile.name}</>
                                : <><Camera size={16} /> Tap to attach resolution photo (optional)</>
                            }
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={e => setProofFile(e.target.files[0] || null)}
                        />

                        <label className="form-label" style={{ marginTop: 12 }}>Resolution note</label>
                        <textarea
                            className="modal-textarea"
                            rows={3}
                            placeholder="Describe what was done, materials used, etc."
                            value={proofNote}
                            onChange={e => setProofNote(e.target.value)}
                        />

                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={() => setResolveModal(null)}>Cancel</button>
                            <button
                                className="btn-accept"
                                disabled={resolveLoading}
                                onClick={handleResolveWithProof}
                            >
                                {resolveLoading ? 'Uploading…' : 'Submit & resolve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
