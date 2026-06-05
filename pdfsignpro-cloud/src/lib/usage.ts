import { prisma } from "@/lib/prisma";
import {
  getEffectivePlanId,
  getMonthlySignLimit,
  getPlanDef,
  type PlanId,
} from "@/lib/plans";

/** Start of current month (UTC) for reset date */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0));
}

/** End of current month (exclusive) */
function endOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
}

/**
 * Count completed signing jobs in the current month that count toward user's quota:
 * - Jobs on documents owned by userId, or
 * - Jobs that are part of a contract owned by userId (each job counted once)
 */
export async function getMonthlyUsage(userId: string): Promise<number> {
  const start = startOfCurrentMonth();
  const end = endOfCurrentMonth();

  return prisma.signingJob.count({
    where: {
      status: "COMPLETED",
      completedAt: { gte: start, lte: end },
      OR: [
        { document: { userId } },
        { contractSigner: { contract: { userId } } },
      ],
    },
  });
}

export function getResetAt(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0));
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanId;
  planName: string;
  planExpiresAt: string | null;
}

/**
 * Resolve the user's effective plan + monthly limit and current usage.
 * Expired paid plans automatically fall back to the free quota.
 */
export async function checkQuota(userId: string): Promise<QuotaResult> {
  const [user, used] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    }),
    getMonthlyUsage(userId),
  ]);

  const planContext = {
    plan: user?.plan ?? "free",
    planExpiresAt: user?.planExpiresAt ?? null,
  };
  const effectivePlan = getEffectivePlanId(planContext);
  const limit = getMonthlySignLimit(planContext);

  return {
    allowed: used < limit,
    used,
    limit,
    plan: effectivePlan,
    planName: getPlanDef(effectivePlan).name,
    planExpiresAt: user?.planExpiresAt?.toISOString() ?? null,
  };
}
