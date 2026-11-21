import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, User } from "../api";
import { BrandLockup } from "../components/Brand";

export default function RegisterPage({ onAuth }: { onAuth: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await api<User>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      onAuth(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <BrandLockup />
        <h1>Đăng ký</h1>
        <div className="field">
          <label htmlFor="reg-name">Tên</label>
          <input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="reg-pass">Mật khẩu</label>
          <input
            id="reg-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "…" : "Đăng ký"}
        </button>
        <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </form>
    </div>
  );
}
