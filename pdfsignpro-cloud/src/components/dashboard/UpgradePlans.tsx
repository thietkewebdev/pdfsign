"use client";

import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLAN_IDS, PLANS, formatVnd, type PlanId } from "@/lib/plans";
import { usePaymentFlow } from "@/components/billing/usePaymentFlow";
import { PaymentDialog } from "@/components/billing/PaymentDialog";

export function UpgradePlans({
  currentPlan,
  onActivated,
}: {
  currentPlan: PlanId;
  onActivated?: () => void;
}) {
  const { creating, payment, paid, start, close } = usePaymentFlow(onActivated);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === currentPlan;
          return (
            <Card key={id} className={isCurrent ? "border-primary ring-1 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Đang dùng</Badge>}
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">
                    {plan.priceVnd === 0 ? "Miễn phí" : formatVnd(plan.priceVnd)}
                  </span>
                  {plan.priceVnd > 0 && <span className="text-sm"> / tháng</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.paid ? (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={creating !== null}
                    onClick={() => void start(id)}
                  >
                    {creating === id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isCurrent ? (
                      "Gia hạn"
                    ) : (
                      "Nâng cấp"
                    )}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {isCurrent ? "Đang dùng" : "Gói cơ bản"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PaymentDialog payment={payment} paid={paid} onClose={close} />
    </>
  );
}
