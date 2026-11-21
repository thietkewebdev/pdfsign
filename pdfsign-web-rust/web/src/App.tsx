import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, User } from "./api";
import { ToastProvider } from "./toast";
import AppShell from "./components/AppShell";
import MarketingShell from "./components/MarketingShell";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentsPage from "./pages/DocumentsPage";
import PlaceBoxPage from "./pages/PlaceBoxPage";
import JobPage from "./pages/JobPage";
import VerifyPage from "./pages/VerifyPage";
import SettingsPage from "./pages/SettingsPage";

function Guard({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <AppShell user={user} onLogout={onLogout}>
      {children}
    </AppShell>
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
    nav("/");
  }

  if (loading) {
    return (
      <div className="auth-wrap">
        <div className="skeleton" style={{ width: 280, height: 120 }} />
      </div>
    );
  }

  return (
    <ToastProvider>
      <Routes>
        <Route
          path="/"
          element={
            <MarketingShell user={user}>
              <LandingPage user={user} onAuth={setUser} />
            </MarketingShell>
          }
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onAuth={setUser} />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage onAuth={setUser} />}
        />
        <Route
          path="/verify"
          element={
            user ? (
              <Guard user={user} onLogout={logout}>
                <VerifyPage />
              </Guard>
            ) : (
              <MarketingShell user={null}>
                <div className="section" style={{ paddingTop: 32 }}>
                  <VerifyPage />
                </div>
              </MarketingShell>
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            user ? (
              <Guard user={user} onLogout={logout}>
                <DashboardPage />
              </Guard>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/documents"
          element={
            user ? (
              <Guard user={user} onLogout={logout}>
                <DocumentsPage />
              </Guard>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/d/:publicId"
          element={
            user ? (
              <Guard user={user} onLogout={logout}>
                <PlaceBoxPage />
              </Guard>
            ) : (
              <MarketingShell user={null}>
                <div className="section" style={{ paddingTop: 24, maxWidth: 1120, margin: "0 auto" }}>
                  <PlaceBoxPage />
                </div>
              </MarketingShell>
            )
          }
        />
        <Route
          path="/jobs/:jobId"
          element={
            user ? (
              <Guard user={user} onLogout={logout}>
                <JobPage />
              </Guard>
            ) : (
              <MarketingShell user={null}>
                <div className="section" style={{ paddingTop: 24, maxWidth: 720, margin: "0 auto" }}>
                  <JobPage />
                </div>
              </MarketingShell>
            )
          }
        />
        <Route
          path="/settings"
          element={
            user ? (
              <Guard user={user} onLogout={logout}>
                <SettingsPage user={user} />
              </Guard>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
