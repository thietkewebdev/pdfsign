"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_IDS, PLANS, formatVnd, type PlanId } from "@/lib/plans";
import { usePaymentFlow } from "@/components/billing/usePaymentFlow";
import { PaymentDialog } from "@/components/billing/PaymentDialog";
import { cn } from "@/lib/utils";

const UPGRADE_CALLBACK = "/dashboard?tab=usage";
const HIGHLIGHT_PLAN: PlanId = "pro";

export function HomePricing() {
  const router = useRouter();
  const { status } = useSession();
  const { creating, payment, paid, start, close } = usePaymentFlow();

  const handlePaid = (plan: PlanId) => {
    if (status !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(UPGRADE_CALLBACK)}`);
      return;
    }
    void start(plan);
  };

  return (
    <section id="pricing" className="bg-white px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-4xl font-black tracking-tighter text-stitch-on-surface">
            Bảng giá linh hoạt
          </h2>
          <p className="text-stitch-muted">
            Chọn gói phù hợp và thanh toán online qua chuyển khoản — kích hoạt tự động.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const highlight = id === HIGHLIGHT_PLAN;
            return (
              <div
                key={id}
                className={cn(
                  "relative flex flex-col rounded-xl p-8",
                  highlight
                    ? "border-2 border-stitch-primary-strong bg-white ambient-shadow-stitch"
                    : "border border-stitch-outline/20 bg-stitch-bg"
                )}
              >
                {highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-stitch-primary-strong px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">
                    Phổ biến nhất
                  </div>
                )}
                <div className="mb-8">
                  <h4
                    className={cn(
                      "mb-2 text-xs font-bold uppercase tracking-widest",
                      highlight ? "text-stitch-primary-strong" : "text-stitch-muted"
                    )}
                  >
                    {plan.name}
                  </h4>
                  <div
                    className={cn(
                      "text-4xl font-black",
                      highlight && "text-stitch-primary-strong"
                    )}
                  >
                    {plan.priceVnd === 0 ? "0đ" : formatVnd(plan.priceVnd)}
                    <span className="text-lg font-normal text-stitch-muted">/tháng</span>
                  </div>
                </div>

                <ul className="mb-10 flex flex-grow flex-col gap-4 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <CheckCircle2 className="size-4 shrink-0 text-stitch-primary" />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.paid ? (
                  <Button
                    className={cn(
                      "h-12 w-full font-bold",
                      highlight
                        ? "hero-gradient-stitch text-white"
                        : "rounded-lg bg-stitch-container-highest"
                    )}
                    disabled={creating !== null}
                    onClick={() => handlePaid(id)}
                  >
                    {creating === id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Nâng cấp ngay"
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-lg border-stitch-primary font-bold text-stitch-primary"
                    asChild
                  >
                    <Link href="/#upload">Bắt đầu ngay</Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-stitch-muted">
          Cần giải pháp riêng cho doanh nghiệp lớn (API/ERP, nhiều người dùng)?{" "}
          <Link href="/#contact" className="font-medium text-stitch-primary underline-offset-4 hover:underline">
            Liên hệ chúng tôi
          </Link>
        </p>
      </div>

      <PaymentDialog payment={payment} paid={paid} onClose={close} />
    </section>
  );
}
