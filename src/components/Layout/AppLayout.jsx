import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './Sidebar.css';
import './TopBar.css';
const AppLayout = ({ children, role, user }) => {
  return (
    <div className="app-layout">
      <Sidebar role={role} user={user} />
      <TopBar user={user} />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
};
export default AppLayout;
