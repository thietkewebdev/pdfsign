/**
 * Subscription plans + monthly signing quotas (single source of truth).
 *
 * - free:    10 signed files / month, no cost.
 * - pro:     50 signed files / month, 100.000đ / month.
 * - premium: 150 signed files / month, 500.000đ / month.
 *
 * Paid plans are time-bound: a successful payment activates the plan for
 * PLAN_DURATION_DAYS. After it expires the user falls back to "free".
 */

export type PlanId = "free" | "pro" | "premium";

export interface PlanDef {
  id: PlanId;
  /** Display name (Vietnamese). */
  name: string;
  /** Price in VND for one billing period (0 for free). */
  priceVnd: number;
  /** Max successful signing jobs per calendar month. */
  monthlySignLimit: number;
  /** Whether this is a paid (time-bound) plan. */
  paid: boolean;
  /** Short marketing bullet points. */
  features: string[];
}

/** How long a paid plan stays active after a successful payment. */
export const PLAN_DURATION_DAYS = 30;

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Miễn phí",
    priceVnd: 0,
    monthlySignLimit: 10,
    paid: false,
    features: [
      "Ký 10 file/tháng",
      "Ký số bằng USB Token",
      "Hỗ trợ hợp đồng nhiều bên",
    ],
  },
  pro: {
    id: "pro",
    name: "Chuyên nghiệp",
    priceVnd: 100_000,
    monthlySignLimit: 50,
    paid: true,
    features: [
      "Ký 50 file/tháng",
      "Toàn bộ tính năng gói Miễn phí",
      "Ưu tiên hỗ trợ",
    ],
  },
  premium: {
    id: "premium",
    name: "Doanh nghiệp",
    priceVnd: 500_000,
    monthlySignLimit: 150,
    paid: true,
    features: [
      "Ký 150 file/tháng",
      "Toàn bộ tính năng gói Chuyên nghiệp",
      "Hỗ trợ ưu tiên cao nhất",
    ],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const PAID_PLAN_IDS = PLAN_IDS.filter((id) => PLANS[id].paid);

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

export function getPlanDef(planId: string | null | undefined): PlanDef {
  if (planId && isPlanId(planId)) return PLANS[planId];
  return PLANS.free;
}

/**
 * Resolve the plan a user is actually entitled to right now. A paid plan whose
 * planExpiresAt is in the past is treated as expired → "free".
 */
export function getEffectivePlanId(user: {
  plan: string | null;
  planExpiresAt: Date | null;
}): PlanId {
  const planId = user.plan && isPlanId(user.plan) ? user.plan : "free";
  const def = PLANS[planId];
  if (!def.paid) return planId;
  if (user.planExpiresAt && user.planExpiresAt.getTime() > Date.now()) {
    return planId;
  }
  return "free";
}

export function getMonthlySignLimit(user: {
  plan: string | null;
  planExpiresAt: Date | null;
}): number {
  return PLANS[getEffectivePlanId(user)].monthlySignLimit;
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}
