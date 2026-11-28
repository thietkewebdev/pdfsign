import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { PLANS } from "../plans";
import { useToast } from "../toast";

type AdminUser = {
  id: string;
  email: string;
  name?: string | null;
  plan: string;
  planPeriod: string;
  trialFilesUsed: number;
  quotaUsed: number;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState("personal");
  const [period, setPeriod] = useState("monthly");
  const toast = useToast();

  async function refresh() {
    const data = await api<{ users: AdminUser[] }>("/admin/users");
    setUsers(data.users || []);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function onSetPlan(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/admin/users/${encodeURIComponent(target)}/plan`, {
        method: "POST",
        body: JSON.stringify({ plan, planPeriod: period }),
      });
      toast.push("Đã cập nhật gói", "ok");
      setTarget("");
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      setError(msg);
      toast.push(msg, "err");
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Quản trị · Gói người dùng</h1>
      </div>
      {error && <div className="error">{error}</div>}

      <form className="card card-pad" style={{ maxWidth: 560, marginBottom: 20 }} onSubmit={onSetPlan}>
        <div className="field">
          <label>Email hoặc ID người dùng</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} required />
        </div>
        <div className="field">
          <label>Gói</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Chu kỳ</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="monthly">Theo tháng</option>
            <option value="yearly">Theo năm</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Gán gói
        </button>
      </form>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Gói</th>
                <th>Chu kỳ</th>
                <th>Đã dùng thử</th>
                <th>Đã dùng tháng này</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setTarget(u.email)}
                    >
                      {u.email}
                    </button>
                  </td>
                  <td>{PLANS.find((p) => p.id === u.plan)?.name ?? u.plan}</td>
                  <td>{u.planPeriod === "yearly" ? "Theo năm" : u.planPeriod === "monthly" ? "Theo tháng" : (u.planPeriod ?? "")}</td>
                  <td>{u.trialFilesUsed}</td>
                  <td>{u.quotaUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
