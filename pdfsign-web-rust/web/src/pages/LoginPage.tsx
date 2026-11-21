import { FormEvent, useState } from "react";
import { api, User } from "../api";

export default function LoginPage({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo@pdfsign.local");
  const [password, setPassword] = useState("demo-demo-1");
  const [name, setName] = useState("Demo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body =
        mode === "login"
          ? { email, password }
          : { email, password, name };
      const u = await api<User>(path, { method: "POST", body: JSON.stringify(body) });
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
        <div className="brand" style={{ paddingLeft: 0 }}>
          <div className="brand-mark">✓</div>
          <div>
            <strong style={{ color: "var(--ink)" }}>PDFSign</strong>
            <span>Ký số PDF</span>
          </div>
        </div>
        <h1>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
        <p>Email và mật khẩu</p>
        {mode === "register" && (
          <div className="field">
            <label>Tên</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "…" : mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          {mode === "login" ? (
            <>
              Chưa có tài khoản?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); }}>
                Đăng ký
              </a>
            </>
          ) : (
            <>
              Đã có tài khoản?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); }}>
                Đăng nhập
              </a>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
