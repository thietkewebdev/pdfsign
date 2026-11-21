import type { User } from "../api";

export default function SettingsPage({ user }: { user: User }) {
  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Cài đặt</h1>
      </div>

      <div className="card card-pad" style={{ maxWidth: 520 }}>
        <h2 className="h3" style={{ marginBottom: 16 }}>
          Hồ sơ
        </h2>
        <div className="field">
          <label>Email</label>
          <input value={user.email} readOnly />
        </div>
        <div className="field">
          <label>Tên</label>
          <input value={user.name || ""} readOnly placeholder="Chưa đặt" />
        </div>
        <div className="field">
          <label>Gói</label>
          <input value={user.plan || "free"} readOnly />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>ID</label>
          <input value={user.id} readOnly />
        </div>
      </div>
    </div>
  );
}
