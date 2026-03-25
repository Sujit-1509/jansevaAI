import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, ClipboardList, BarChart3, Users, HelpCircle, LogOut, User, Menu, X } from 'lucide-react';
import './Sidebar.css';
const citizenNav = [
  { to: '/', icon: <Home size={18} />, label: 'Home' },
  { to: '/submit', icon: <FileText size={18} />, label: 'Report Issue' },
  { to: '/my-complaints', icon: <ClipboardList size={18} />, label: 'My Complaints' },
];
const adminNav = [
  { to: '/dashboard', icon: <Home size={18} />, label: 'Dashboard' },
  { to: '/complaints', icon: <ClipboardList size={18} />, label: 'All Complaints' },
  { to: '/analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
  { to: '/worker', icon: <Users size={18} />, label: 'Workers' },
];
const workerNav = [
  { to: '/worker', icon: <Home size={18} />, label: 'My Tasks' },
  { to: '/complaints', icon: <ClipboardList size={18} />, label: 'Complaints' },
];
const Sidebar = ({ role = 'citizen', user, onLogout }) => {
  const location = useLocation();
  const nav = role === 'admin' ? adminNav : role === 'worker' ? workerNav : citizenNav;
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <>
      <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
        <Menu size={22} />
      </button>
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg"
            alt="Emblem of India"
            className="sidebar-emblem-img"
          />
          <div className="sidebar-brand-text">
            <h2>JanSevaAI</h2>
            <span>Smart City Mission</span>
          </div>
          <button className="mobile-close-btn" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <p className="sidebar-section-label">Navigation</p>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`sidebar-link ${location.pathname === item.to ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            <User size={16} />
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || 'User'}</div>
            <div className="sidebar-user-role">{role.charAt(0).toUpperCase() + role.slice(1)}</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={14} />
          Logout
        </button>
      </aside>
    </>
  );
};
export default Sidebar;
