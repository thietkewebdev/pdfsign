import { FormEvent, useState } from "react";
import { api, ApiError, User } from "../api";

export default function AuthGateModal({
  open,
  onClose,
  onAuth,
  resumeHint,
}: {
  open: boolean;
  onClose: () => void;
  onAuth: (u: User) => void;
  resumeHint?: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, name: name || undefined };
      const u = await api<User>(path, { method: "POST", body: JSON.stringify(body) });
      onAuth(u);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title">
      <form className="modal card card-pad" onSubmit={submit}>
        <h2 id="auth-gate-title" className="h2" style={{ fontSize: 22 }}>
          {mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </h2>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          {resumeHint || "Đã dùng hết 2 file ký thử. Đăng ký hoặc đăng nhập để tiếp tục."}
        </p>
        {mode === "register" && (
          <div className="field">
            <label htmlFor="gate-name">Tên</label>
            <input id="gate-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="gate-email">Email</label>
          <input
            id="gate-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="gate-pass">Mật khẩu</label>
          <input
            id="gate-pass"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="toolbar">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          {mode === "login" ? (
            <button type="button" className="linkish" onClick={() => setMode("register")}>
              Đăng ký
            </button>
          ) : (
            <button type="button" className="linkish" onClick={() => setMode("login")}>
              Đăng nhập
            </button>
          )}
        </p>
      </form>
    </div>
  );
}
