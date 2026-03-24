import { useState, useEffect } from 'react';
import { Plus, Trash2, Search, UserPlus, ShieldAlert, Loader2, Phone, User, Briefcase, Building2 } from 'lucide-react';
import { getWorkers, addWorker, removeWorker } from '../../services/api';
import './AdminWorkers.css';

const AdminWorkers = () => {
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    const [showAddModal, setShowAddModal] = useState(false);
    const [newWorker, setNewWorker] = useState({ name: '', phone: '', department: 'PWD' });
    const [adding, setAdding] = useState(false);
    
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

    useEffect(() => {
        fetchWorkers();
    }, []);

    const showToast = (message, type = 'info') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
    };

    const fetchWorkers = async () => {
        setLoading(true);
        const res = await getWorkers();
        if (res.success) {
            setWorkers(res.workers || []);
        } else {
            showToast('Failed to load workers', 'error');
        }
        setLoading(false);
    };

    const handleAddWorker = async (e) => {
        e.preventDefault();
        if (!newWorker.name || !newWorker.phone) return;
        
        setAdding(true);
        try {
            const adminUser = JSON.parse(localStorage.getItem('jansevaai_user') || '{}');
            const data = {
                ...newWorker,
                added_by: adminUser.name || 'Admin'
            };
            const res = await addWorker(data);
            if (res.success) {
                showToast('Worker added successfully', 'success');
                setShowAddModal(false);
                setNewWorker({ name: '', phone: '', department: 'PWD' });
                fetchWorkers(); // reload list
            } else {
                showToast(res.error || 'Failed to add worker', 'error');
            }
        } catch (err) {
            showToast('Error adding worker', 'error');
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteWorker = async (phone, name) => {
        if (!window.confirm(`Are you sure you want to remove ${name}? They will lose access.`)) return;
        
        try {
            const res = await removeWorker(phone);
            if (res.success) {
                showToast('Worker removed', 'success');
                setWorkers(prev => prev.filter(w => w.phone !== phone));
            } else {
                showToast(res.error || 'Failed to remove worker', 'error');
            }
        } catch (err) {
            showToast('Error removing worker', 'error');
        }
    };

    const filteredWorkers = workers.filter(w => 
        w.name?.toLowerCase().includes(search.toLowerCase()) || 
        w.phone?.includes(search) ||
        w.department?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="admin-workers animate-fade-in">
            <div className="page-header">
                <div>
                    <h1>Worker Management</h1>
                    <p className="text-muted">Manage field workers and permissions</p>
                </div>
                <button className="btn btn-primary premium-btn" onClick={() => setShowAddModal(true)}>
                    <UserPlus size={18} /> Add Worker
                </button>
            </div>

            <div className="workers-glass-panel">
                <div className="filters-bar">
                    <div className="search-box">
                        <Search size={18} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search by name, phone, or department..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="worker-stats-mini mb-2" style={{ marginTop: '16px', padding: '0 20px' }}>
                    <div className="wstat">
                        <span className="wstat-val">{workers.length}</span>
                        <span className="wstat-lbl">Active Workers</span>
                    </div>
                    <div className="wstat">
                        <span className="wstat-val">{new Set(workers.map(w => w.department)).size}</span>
                        <span className="wstat-lbl">Departments</span>
                    </div>
                </div>

                <div className="workers-table-wrapper">
                    <table className="workers-table">
                        <thead>
                            <tr>
                                <th>Worker Info</th>
                                <th>Department</th>
                                <th>Added Date</th>
                                <th>Status</th>
                                <th className="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="text-center py-5">
                                        <Loader2 size={24} className="spin-icon mx-auto text-muted" />
                                        <p className="mt-2 text-muted">Loading workers...</p>
                                    </td>
                                </tr>
                            ) : filteredWorkers.length > 0 ? (
                                filteredWorkers.map((worker) => (
                                    <tr key={worker.phone} className="worker-row">
                                        <td>
                                            <div className="worker-name-cell">
                                                <div className="worker-avatar">{worker.name.charAt(0)}</div>
                                                <div>
                                                    <div className="worker-name">{worker.name}</div>
                                                    <div className="worker-phone">{worker.phone}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span className="dept-pill badge" style={{background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-border)'}}>{worker.department}</span></td>
                                        <td className="text-muted text-sm">
                                            {worker.created_at ? new Date(worker.created_at).toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td><span className="status-dot active">Active</span></td>
                                        <td className="text-right">
                                            <div className="action-cell" style={{justifyContent: 'flex-end'}}>
                                                <button 
                                                    className="btn btn-icon danger" 
                                                    onClick={() => handleDeleteWorker(worker.phone, worker.name)}
                                                    title="Remove Worker"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="text-center py-5">
                                        <ShieldAlert size={32} className="text-muted mx-auto mb-2 opacity-50" />
                                        <p className="text-muted">No workers found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Worker Modal */}
            {showAddModal && (
                <div className="worker-modal-overlay">
                    <div className="worker-modal">
                        <div className="modal-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <h2>Register New Worker</h2>
                            <button className="btn btn-icon" onClick={() => setShowAddModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleAddWorker} className="modal-body">
                            <div className="form-grid">
                                <div className="form-group form-grid-full">
                                    <label>Full Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Ramesh Singh"
                                        value={newWorker.name}
                                        onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Phone Number</label>
                                    <input
                                        type="tel"
                                        placeholder="9876543210"
                                        pattern="[0-9]{10}"
                                        value={newWorker.phone}
                                        onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value.replace(/\D/g, '') })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Department</label>
                                    <select 
                                        value={newWorker.department}
                                        onChange={(e) => setNewWorker({ ...newWorker, department: e.target.value })}
                                    >
                                        <option value="PWD">PWD (Roads & Infrastructure)</option>
                                        <option value="Sanitation">Sanitation (Waste Management)</option>
                                        <option value="Water Supply">Water Supply Board</option>
                                        <option value="Electricity">Electricity Board</option>
                                        <option value="Parks & Rec">Parks & Recreation</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={adding}>
                                    {adding ? <Loader2 size={16} className="spin-icon" /> : <Plus size={16} />} 
                                    {adding ? 'Adding...' : 'Register Worker'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {toast.show && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        </div>
    );
};

export default AdminWorkers;
