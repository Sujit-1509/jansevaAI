import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './Sidebar.css';
import './TopBar.css';
const AppLayout = ({ children, role, user, onLogout }) => {
  return (
    <div className="app-layout">
      <Sidebar role={role} user={user} onLogout={onLogout} />
      <TopBar user={user} />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
};
export default AppLayout;
