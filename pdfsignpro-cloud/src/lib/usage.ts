import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  getEffectivePlanId,
  getMonthlySignLimit,
  getPlanDef,
  type PlanId,
} from "@/lib/plans";

/** Monthly signing limit for anonymous (not logged-in) users, tracked per client IP. */
export const ANON_MONTHLY_LIMIT = 3;

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

/** Hash a client IP so we never store raw IPs (salted with the auth secret). */
export function hashClientIp(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "pdfsign";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Count completed anonymous (no-owner) signing jobs for an IP in the current month. */
export async function getAnonymousMonthlyUsage(ipHash: string): Promise<number> {
  const start = startOfCurrentMonth();
  const end = endOfCurrentMonth();
  return prisma.signingJob.count({
    where: {
      status: "COMPLETED",
      completedAt: { gte: start, lte: end },
      creatorIpHash: ipHash,
      document: { userId: null },
    },
  });
}

export async function checkAnonymousQuota(
  ipHash: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const used = await getAnonymousMonthlyUsage(ipHash);
  return { allowed: used < ANON_MONTHLY_LIMIT, used, limit: ANON_MONTHLY_LIMIT };
}
