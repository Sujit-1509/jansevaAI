import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './Sidebar.css';
import './TopBar.css';
const CitizenLayout = ({ children, user, onLogout }) => {
  return (
    <div className="app-layout">
      <Sidebar role="citizen" user={user} onLogout={onLogout} />
      <TopBar user={user} />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
};
export default CitizenLayout;
