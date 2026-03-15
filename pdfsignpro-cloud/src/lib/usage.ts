import { prisma } from "@/lib/prisma";

export const FREE_MONTHLY_LIMIT = 50;

/** Start of current month (VN timezone) for reset date */
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

export async function checkQuota(userId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const used = await getMonthlyUsage(userId);
  const allowed = used < FREE_MONTHLY_LIMIT;
  return { allowed, used, limit: FREE_MONTHLY_LIMIT };
}
