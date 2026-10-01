import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useAuth } from "../store/auth";

export function AccountScreen() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const confirmLogout = () => {
    if (confirm("Log out? You will need to log in again to listen.")) logout();
  };

  return (
    <div className="page account">
      <div className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="back" size={26} />
        </button>
      </div>

      <div className="profile">
        <span className="avatar-lg" aria-hidden="true">
          {(user?.name ?? "?").trim().charAt(0).toUpperCase()}
        </span>
        <h1>{user?.name ?? "Your account"}</h1>
        <p className="muted">{user?.email}</p>
        {user?.is_admin && <span className="badge">Admin</span>}
      </div>

      <button className="btn danger-outline wide" onClick={confirmLogout}>
        <Icon name="logout" size={18} /> Log out
      </button>
    </div>
  );
}
