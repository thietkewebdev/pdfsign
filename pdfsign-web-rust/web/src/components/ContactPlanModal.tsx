import { HOME_FACTS, HOME } from "../homeContent";
import type { Plan } from "../plans";

export default function ContactPlanModal({
  open,
  plan,
  periodLabel,
  onClose,
}: {
  open: boolean;
  plan: Plan | null;
  periodLabel: string;
  onClose: () => void;
}) {
  if (!open || !plan) return null;
  const tel = HOME_FACTS.hotlineTel ? `tel:${HOME_FACTS.hotlineTel}` : `mailto:${HOME.company.email}`;
  const zalo = HOME_FACTS.zaloUrl || "https://zalo.me/0984056777";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="plan-contact-title">
      <div className="modal card card-pad" style={{ maxWidth: 420 }}>
        <h2 id="plan-contact-title" className="h2" style={{ fontSize: 22 }}>
          Chọn gói {plan.name}
        </h2>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          Thanh toán online sẽ có sau. Liên hệ Hotline/Zalo để kích hoạt gói {plan.name}
          {periodLabel ? ` (${periodLabel})` : ""}. Admin sẽ gán gói vào tài khoản của bạn.
        </p>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <a className="btn btn-primary" href={tel}>
            Gọi {HOME_FACTS.hotline || "0984.056.777"}
          </a>
          <a className="btn btn-ghost" href={zalo} target="_blank" rel="noreferrer">
            Nhắn Zalo
          </a>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
