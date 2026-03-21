import { Bell, Search, User } from 'lucide-react';
import './TopBar.css';

const TopBar = ({ user }) => {
  return (
    <header className="topbar-wrapper">
      <div className="gov-marquee">
        <div className="marquee-track">
          <span className="marquee-content">
            Government of India &nbsp;—&nbsp; Smart City Mission &nbsp;&nbsp;|&nbsp;&nbsp;
            Ministry of Housing and Urban Affairs &nbsp;&nbsp;|&nbsp;&nbsp;
            Digital India Initiative — Empowering Citizens Through Technology &nbsp;&nbsp;|&nbsp;&nbsp;
            सत्यमेव जयते — Satyameva Jayate &nbsp;&nbsp;|&nbsp;&nbsp;
            Report Civic Issues Online — Get Faster Resolution &nbsp;&nbsp;|&nbsp;&nbsp;
            Building Smart Cities for a Better Tomorrow &nbsp;&nbsp;|&nbsp;&nbsp;
          </span>
          <span className="marquee-content" aria-hidden="true">
            Government of India &nbsp;—&nbsp; Smart City Mission &nbsp;&nbsp;|&nbsp;&nbsp;
            Ministry of Housing and Urban Affairs &nbsp;&nbsp;|&nbsp;&nbsp;
            Digital India Initiative — Empowering Citizens Through Technology &nbsp;&nbsp;|&nbsp;&nbsp;
            सत्यमेव जयते — Satyameva Jayate &nbsp;&nbsp;|&nbsp;&nbsp;
            Report Civic Issues Online — Get Faster Resolution &nbsp;&nbsp;|&nbsp;&nbsp;
            Building Smart Cities for a Better Tomorrow &nbsp;&nbsp;|&nbsp;&nbsp;
          </span>
        </div>
      </div>

      <div className="topbar">
        <div className="topbar__left">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg"
            alt="Emblem of India"
            className="topbar__emblem"
          />
          <div className="topbar__divider" />
          <div className="topbar__gov-text">
            <span className="topbar__gov-title">JanSevaAI — AI-Powered Municipal Complaint System</span>
            <span className="topbar__gov-sub">Government of India · Smart City Mission</span>
          </div>
        </div>

        <div className="topbar__right">
          <div className="topbar__search">
            <Search size={14} className="topbar__search-icon" />
            <input type="text" placeholder="Search complaints…" />
          </div>

          <button className="topbar__bell" aria-label="Notifications">
            <Bell size={17} />
            <span className="topbar__bell-dot" />
          </button>

          <div className="topbar__user">
            <div className="topbar__user-avatar">
              <User size={14} />
            </div>
            <div>
              <div className="topbar__user-name">{user?.name || 'User'}</div>
              <div className="topbar__user-role">{user?.role || 'citizen'}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
