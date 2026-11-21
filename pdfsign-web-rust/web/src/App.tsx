import { Navigate, Route, Routes, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, User } from "./api";
import LoginPage from "./pages/LoginPage";
import DocumentsPage from "./pages/DocumentsPage";
import PlaceBoxPage from "./pages/PlaceBoxPage";
import JobPage from "./pages/JobPage";
import VerifyPage from "./pages/VerifyPage";

function Shell({ user, onLogout, children }: { user: User; onLogout: () => void; children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✓</div>
          <div>
            <strong>PDFSign</strong>
            <span>Ký số PDF</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/documents" className={({ isActive }) => (isActive ? "active" : "")}>
            Tài liệu
          </NavLink>
          <NavLink to="/verify" className={({ isActive }) => (isActive ? "active" : "")}>
            Xác minh
          </NavLink>
        </nav>
        <div style={{ marginTop: "auto", padding: 8, fontSize: 12, color: "#94a3b8" }}>
          <div>{user.email}</div>
          <button className="btn btn-ghost" style={{ marginTop: 8, color: "#e2e8f0", borderColor: "#334155" }} onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    nav("/login");
  }

  if (loading) return <div className="auth-wrap">Đang tải…</div>;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/documents" replace />
          ) : (
            <LoginPage onAuth={(u) => setUser(u)} />
          )
        }
      />
      <Route
        path="/documents"
        element={
          user ? (
            <Shell user={user} onLogout={logout}>
              <DocumentsPage />
            </Shell>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/d/:publicId"
        element={
          user ? (
            <Shell user={user} onLogout={logout}>
              <PlaceBoxPage />
            </Shell>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          user ? (
            <Shell user={user} onLogout={logout}>
              <JobPage />
            </Shell>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/verify"
        element={
          user ? (
            <Shell user={user} onLogout={logout}>
              <VerifyPage />
            </Shell>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={user ? "/documents" : "/login"} replace />} />
    </Routes>
  );
}
