import { useEffect, useState } from "react";
import { api, type User } from "../api";
import { PLANS } from "../plans";

function planName(plan: string): string {
  return PLANS.find((p) => p.id === plan)?.name ?? plan;
}

type Quota = NonNullable<User["quota"]> & {
  plan?: string;
  remaining?: number | null;
  trialRemaining?: number;
  monthlyFileQuota?: number | null;
  quotaUsed?: number;
};

function quotaLine(q: Quota | undefined, plan: string): string {
  if (!q) return "—";
  if (plan === "unlimited") return "Không giới hạn";
  if (plan === "free") {
    const rem = q.trialRemaining ?? q.remaining ?? 0;
    return `Thử nghiệm còn ${rem} file`;
  }
  if (q.remaining == null) return "—";
  const used = q.quotaUsed ?? 0;
  const limit = q.monthlyFileQuota;
  if (limit != null) return `Đã dùng ${used}/${limit}`;
  return `Còn ${q.remaining} file`;
}

export default function SettingsPage({ user }: { user: User }) {
  const [quota, setQuota] = useState<Quota | undefined>(user.quota);

  useEffect(() => {
    api<Quota>("/billing/quota")
      .then(setQuota)
      .catch(() => setQuota(user.quota));
  }, [user.quota]);

  const plan = user.plan || "free";

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
          <input value={planName(plan)} readOnly />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Hạn mức</label>
          <input value={quotaLine(quota, plan)} readOnly />
        </div>
      </div>
    </div>
  );
}
