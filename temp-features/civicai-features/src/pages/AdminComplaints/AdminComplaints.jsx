import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Clock, Users, ChevronDown, X, Filter, RefreshCw } from 'lucide-react';
import {
    getComplaints,
    updateComplaintStatus,
    assignComplaint,
    bulkUpdateComplaints,
    getSlaBreaches,
} from '../../services/api';
import { normalizeStatus } from '../../services/complaintModel';
import './AdminComplaints.css';

// ── Mock worker roster — replace with a real /workers API when available ──────
const MOCK_WORKERS = [
    { phone: '+919001000001', name: 'Ramesh Kumar',  dept: 'Road Department' },
    { phone: '+919001000002', name: 'Sunita Devi',   dept: 'Sanitation' },
    { phone: '+919001000003', name: 'Arjun Singh',   dept: 'Water Board' },
    { phone: '+919001000004', name: 'Priya Nair',    dept: 'Electrical Department' },
    { phone: '+919001000005', name: 'Mohan Prasad',  dept: 'Road Department' },
];

const STATUS_OPTIONS = ['submitted', 'assigned', 'in_progress', 'resolved', 'closed'];
const SEV_OPTIONS    = ['high', 'medium', 'low', 'pending review'];
const CAT_OPTIONS    = ['road_issue', 'waste', 'water', 'lighting'];

function severityBadge(sev) {
    const map = { high: 'badge-danger', medium: 'badge-warning', low: 'badge-info', 'pending review': 'badge-muted' };
    return `badge ${map[sev] || 'badge-muted'}`;
}
function statusBadge(st) {
    const map = { submitted: 'badge-muted', assigned: 'badge-info', in_progress: 'badge-warning', resolved: 'badge-success', closed: 'badge-success' };
    return `badge ${map[st] || 'badge-muted'}`;
}
function slaLabel(c) {
    if (!c.sla_deadline) return null;
    const ms = new Date(c.sla_deadline).getTime() - Date.now();
    if (ms < 0) return { text: `${Math.round(-ms / 3600000)}h overdue`, cls: 'sla-breach' };
    if (ms < 6 * 3600000) return { text: `${Math.round(ms / 3600000)}h left`, cls: 'sla-warn' };
    return null;
}

export default function AdminComplaints() {
    const navigate = useNavigate();

    // ── Data state ────────────────────────────────────────────────────────────
    const [complaints, setComplaints]     = useState([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState('');

    // ── SLA breach banner ────────────────────────────────────────────────────
    const [slaBreaches, setSlaBreaches]   = useState([]);
    const [slaWarnings, setSlaWarnings]   = useState([]);
    const [showSlaBanner, setShowSlaBanner] = useState(true);

    // ── Filters ───────────────────────────────────────────────────────────────
    const [filterStatus,   setFilterStatus]   = useState('');
    const [filterSeverity, setFilterSeverity] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterAssigned, setFilterAssigned] = useState('');
    const [search, setSearch]                 = useState('');

    // ── Selection (bulk) ──────────────────────────────────────────────────────
    const [selected, setSelected]   = useState(new Set());
    const [bulkMode, setBulkMode]   = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkDropdown, setBulkDropdown] = useState(false);

    // ── Assign modal ──────────────────────────────────────────────────────────
    const [assignModal, setAssignModal]   = useState(null); // complaint object
    const [assignWorker, setAssignWorker] = useState('');
    const [assignNote, setAssignNote]     = useState('');
    const [assignLoading, setAssignLoading] = useState(false);

    // ── Bulk assign modal ─────────────────────────────────────────────────────
    const [bulkAssignOpen, setBulkAssignOpen]   = useState(false);
    const [bulkWorker, setBulkWorker]           = useState('');
    const [bulkNote, setBulkNote]               = useState('');

    // ── Toast ─────────────────────────────────────────────────────────────────
    const [toast, setToast] = useState('');
    const toastTimer = useRef(null);

    function showToast(msg) {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 3200);
    }

    // ── Load complaints + SLA data ────────────────────────────────────────────
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [res, slaRes] = await Promise.all([
                getComplaints(),
                getSlaBreaches(),
            ]);
            setComplaints(res.complaints || []);
            setSlaBreaches(slaRes.breached || []);
            setSlaWarnings(slaRes.warning || []);
        } catch (e) {
            setError('Failed to load complaints.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Filtered list ─────────────────────────────────────────────────────────
    const filtered = complaints.filter(c => {
        if (filterStatus   && c.status   !== filterStatus)   return false;
        if (filterSeverity && c.severity !== filterSeverity) return false;
        if (filterCategory && c.category !== filterCategory) return false;
        if (filterAssigned === 'assigned'   && !c.assigned_to)  return false;
        if (filterAssigned === 'unassigned' && c.assigned_to)   return false;
        if (search) {
            const q = search.toLowerCase();
            if (!c.incident_id?.toLowerCase().includes(q) &&
                !c.description?.toLowerCase().includes(q) &&
                !c.address?.toLowerCase().includes(q) &&
                !c.user_name?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // ── Selection helpers ─────────────────────────────────────────────────────
    const toggleSelect = id => setSelected(s => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });
    const selectAll = () => setSelected(new Set(filtered.map(c => c.incident_id)));
    const clearSel  = () => setSelected(new Set());

    // ── Single status change ──────────────────────────────────────────────────
    async function handleStatusChange(id, status) {
        try {
            await updateComplaintStatus(id, status, '');
            setComplaints(prev => prev.map(c =>
                c.incident_id === id ? { ...c, status: normalizeStatus(status) } : c
            ));
            showToast(`Status updated to ${status}`);
        } catch {
            showToast('Failed to update status');
        }
    }

    // ── Single assign ─────────────────────────────────────────────────────────
    async function handleAssign() {
        if (!assignWorker) return;
        setAssignLoading(true);
        try {
            const worker = MOCK_WORKERS.find(w => w.phone === assignWorker);
            await assignComplaint(
                assignModal.incident_id,
                assignWorker,
                worker?.name || assignWorker,
                assignNote
            );
            setComplaints(prev => prev.map(c =>
                c.incident_id === assignModal.incident_id
                    ? { ...c, status: 'assigned', assigned_to: assignWorker, assigned_to_name: worker?.name }
                    : c
            ));
            showToast(`Assigned to ${worker?.name || assignWorker}`);
            setAssignModal(null);
            setAssignWorker('');
            setAssignNote('');
        } catch {
            showToast('Failed to assign complaint');
        } finally {
            setAssignLoading(false);
        }
    }

    // ── Bulk actions ──────────────────────────────────────────────────────────
    async function handleBulkAction(action) {
        setBulkDropdown(false);
        if (selected.size === 0) return;
        if (action === 'assign') { setBulkAssignOpen(true); return; }

        setBulkLoading(true);
        try {
            const ids = [...selected];
            await bulkUpdateComplaints({ incidentIds: ids, action, note: `Bulk ${action} by admin` });
            const targetStatus = action === 'resolve' ? 'resolved' : action === 'close' ? 'closed' : action;
            setComplaints(prev => prev.map(c =>
                selected.has(c.incident_id) ? { ...c, status: normalizeStatus(targetStatus) } : c
            ));
            showToast(`${ids.length} complaints updated`);
            clearSel();
            setBulkMode(false);
        } catch {
            showToast('Bulk action failed');
        } finally {
            setBulkLoading(false);
        }
    }

    async function handleBulkAssign() {
        if (!bulkWorker) return;
        setBulkLoading(true);
        const worker = MOCK_WORKERS.find(w => w.phone === bulkWorker);
        try {
            const ids = [...selected];
            await bulkUpdateComplaints({
                incidentIds: ids,
                action:      'assign',
                workerPhone: bulkWorker,
                workerName:  worker?.name || bulkWorker,
                note:        bulkNote || `Bulk assigned to ${worker?.name}`,
            });
            setComplaints(prev => prev.map(c =>
                selected.has(c.incident_id)
                    ? { ...c, status: 'assigned', assigned_to: bulkWorker, assigned_to_name: worker?.name }
                    : c
            ));
            showToast(`${ids.length} complaints assigned to ${worker?.name}`);
            clearSel();
            setBulkMode(false);
            setBulkAssignOpen(false);
            setBulkWorker('');
            setBulkNote('');
        } catch {
            showToast('Bulk assign failed');
        } finally {
            setBulkLoading(false);
        }
    }

    const clearFilters = () => {
        setFilterStatus(''); setFilterSeverity('');
        setFilterCategory(''); setFilterAssigned(''); setSearch('');
    };
    const hasFilters = filterStatus || filterSeverity || filterCategory || filterAssigned || search;

    return (
        <div className="admin-complaints">

            {/* ── SLA Breach Banner ─────────────────────────────────────────── */}
            {showSlaBanner && (slaBreaches.length > 0 || slaWarnings.length > 0) && (
                <div className="sla-banner">
                    <div className="sla-banner-inner">
                        <AlertTriangle size={16} className="sla-icon-breach" />
                        {slaBreaches.length > 0 && (
                            <span className="sla-breach-text">
                                <strong>{slaBreaches.length}</strong> complaint{slaBreaches.length > 1 ? 's' : ''} past SLA deadline
                                {slaBreaches[0] && ` — most overdue: ${slaBreaches[0].incident_id} (${slaBreaches[0].hoursOverdue}h)`}
                            </span>
                        )}
                        {slaWarnings.length > 0 && (
                            <span className="sla-warn-text">
                                &nbsp;&nbsp;
                                <Clock size={14} style={{ verticalAlign: 'middle' }} />
                                &nbsp;<strong>{slaWarnings.length}</strong> expiring within 6 hours
                            </span>
                        )}
                        <button className="sla-banner-close" onClick={() => setShowSlaBanner(false)}>
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="ac-header">
                <div className="ac-header-left">
                    <h1 className="ac-title">Complaints</h1>
                    <span className="ac-count">{filtered.length} of {complaints.length}</span>
                </div>
                <div className="ac-header-right">
                    {bulkMode ? (
                        <>
                            <span className="sel-count">{selected.size} selected</span>
                            <button className="btn-ghost" onClick={selectAll}>Select all</button>
                            <button className="btn-ghost" onClick={clearSel}>Clear</button>
                            <div className="bulk-dropdown-wrap">
                                <button
                                    className="btn-primary"
                                    disabled={selected.size === 0 || bulkLoading}
                                    onClick={() => setBulkDropdown(v => !v)}
                                >
                                    {bulkLoading ? 'Working…' : 'Bulk action'}
                                    <ChevronDown size={14} />
                                </button>
                                {bulkDropdown && (
                                    <div className="bulk-dropdown">
                                        <button onClick={() => handleBulkAction('assign')}>Assign to worker</button>
                                        <button onClick={() => handleBulkAction('resolve')}>Mark resolved</button>
                                        <button onClick={() => handleBulkAction('close')}>Close</button>
                                        <button onClick={() => handleBulkAction('set_status')
                                            /* fallthrough to custom status later */}>In progress</button>
                                    </div>
                                )}
                            </div>
                            <button className="btn-ghost" onClick={() => { setBulkMode(false); clearSel(); }}>
                                <X size={14} /> Exit bulk
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn-ghost" onClick={() => setBulkMode(true)}>
                                <Users size={14} /> Bulk select
                            </button>
                            <button className="btn-ghost" onClick={load}>
                                <RefreshCw size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Filters ──────────────────────────────────────────────────── */}
            <div className="ac-filters">
                <div className="filter-group">
                    <Filter size={13} className="filter-icon" />
                    <input
                        className="filter-input"
                        placeholder="Search ID, description, address…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <select className="filter-select" value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
                    <option value="">All severities</option>
                    {SEV_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="">All categories</option>
                    {CAT_OPTIONS.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
                <select className="filter-select" value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
                    <option value="">All</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                </select>
                {hasFilters && (
                    <button className="btn-ghost filter-clear" onClick={clearFilters}>Clear</button>
                )}
            </div>

            {/* ── Main content ─────────────────────────────────────────────── */}
            {loading && <div className="ac-loading">Loading complaints…</div>}
            {error   && <div className="ac-error">{error}</div>}

            {!loading && !error && (
                <div className="ac-table-wrap">
                    <table className="ac-table">
                        <thead>
                            <tr>
                                {bulkMode && <th className="col-check"><input type="checkbox" onChange={e => e.target.checked ? selectAll() : clearSel()} checked={selected.size === filtered.length && filtered.length > 0} /></th>}
                                <th>ID</th>
                                <th>Category</th>
                                <th>Severity</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th>Assigned to</th>
                                <th>SLA</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={bulkMode ? 9 : 8} className="ac-empty">No complaints found</td></tr>
                            )}
                            {filtered.map(c => {
                                const sla = slaLabel(c);
                                return (
                                    <tr
                                        key={c.incident_id}
                                        className={`ac-row ${selected.has(c.incident_id) ? 'ac-row-selected' : ''}`}
                                        onClick={() => bulkMode ? toggleSelect(c.incident_id) : navigate(`/complaint/${c.incident_id}`)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {bulkMode && (
                                            <td className="col-check" onClick={e => { e.stopPropagation(); toggleSelect(c.incident_id); }}>
                                                <input type="checkbox" checked={selected.has(c.incident_id)} onChange={() => {}} />
                                            </td>
                                        )}
                                        <td className="col-id">
                                            <span className="id-text">{c.incident_id?.slice(0, 8)}…</span>
                                        </td>
                                        <td><span className="cat-pill">{(c.category || 'unknown').replace('_', ' ')}</span></td>
                                        <td><span className={severityBadge(c.severity)}>{c.severity}</span></td>
                                        <td>
                                            <div className="priority-bar-wrap">
                                                <div className="priority-bar" style={{ width: `${c.priorityScore || 0}%`, background: c.priorityScore > 70 ? 'var(--color-text-danger)' : c.priorityScore > 40 ? 'var(--color-text-warning)' : 'var(--color-text-info)' }} />
                                                <span className="priority-val">{c.priorityScore || 0}</span>
                                            </div>
                                        </td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <select
                                                className="status-select"
                                                value={c.status}
                                                onChange={e => handleStatusChange(c.incident_id, e.target.value)}
                                            >
                                                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            {c.assigned_to_name || c.assigned_to
                                                ? <span className="worker-tag">{c.assigned_to_name || c.assigned_to.slice(-6)}</span>
                                                : <span className="unassigned-tag">—</span>
                                            }
                                        </td>
                                        <td>
                                            {sla
                                                ? <span className={`sla-pill ${sla.cls}`}>{sla.text}</span>
                                                : <span className="sla-ok">—</span>
                                            }
                                        </td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <button
                                                className="btn-assign"
                                                onClick={() => { setAssignModal(c); setAssignWorker(c.assigned_to || ''); }}
                                            >
                                                {c.assigned_to ? 'Reassign' : 'Assign'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Assign modal ──────────────────────────────────────────────── */}
            {assignModal && (
                <div className="modal-backdrop" onClick={() => setAssignModal(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Assign complaint</h3>
                            <button className="modal-close" onClick={() => setAssignModal(null)}><X size={16} /></button>
                        </div>
                        <p className="modal-sub">
                            <strong>{assignModal.incident_id?.slice(0, 12)}…</strong> &middot;
                            {' '}{assignModal.category} &middot;
                            {' '}{assignModal.severity}
                        </p>
                        <label className="form-label">Select worker</label>
                        <select className="modal-select" value={assignWorker} onChange={e => setAssignWorker(e.target.value)}>
                            <option value="">— choose worker —</option>
                            {MOCK_WORKERS.map(w => (
                                <option key={w.phone} value={w.phone}>{w.name} ({w.dept})</option>
                            ))}
                        </select>
                        <label className="form-label" style={{ marginTop: '12px' }}>Note (optional)</label>
                        <input
                            className="modal-input"
                            placeholder="e.g. Priority repair, near school zone"
                            value={assignNote}
                            onChange={e => setAssignNote(e.target.value)}
                        />
                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={() => setAssignModal(null)}>Cancel</button>
                            <button
                                className="btn-primary"
                                disabled={!assignWorker || assignLoading}
                                onClick={handleAssign}
                            >
                                {assignLoading ? 'Assigning…' : 'Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk assign modal ─────────────────────────────────────────── */}
            {bulkAssignOpen && (
                <div className="modal-backdrop" onClick={() => setBulkAssignOpen(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Bulk assign {selected.size} complaints</h3>
                            <button className="modal-close" onClick={() => setBulkAssignOpen(false)}><X size={16} /></button>
                        </div>
                        <label className="form-label">Select worker</label>
                        <select className="modal-select" value={bulkWorker} onChange={e => setBulkWorker(e.target.value)}>
                            <option value="">— choose worker —</option>
                            {MOCK_WORKERS.map(w => (
                                <option key={w.phone} value={w.phone}>{w.name} ({w.dept})</option>
                            ))}
                        </select>
                        <label className="form-label" style={{ marginTop: '12px' }}>Note (optional)</label>
                        <input
                            className="modal-input"
                            placeholder="Optional note for all assignments"
                            value={bulkNote}
                            onChange={e => setBulkNote(e.target.value)}
                        />
                        <div className="modal-actions">
                            <button className="btn-ghost" onClick={() => setBulkAssignOpen(false)}>Cancel</button>
                            <button
                                className="btn-primary"
                                disabled={!bulkWorker || bulkLoading}
                                onClick={handleBulkAssign}
                            >
                                {bulkLoading ? 'Assigning…' : `Assign ${selected.size} complaints`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast ────────────────────────────────────────────────────── */}
            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
