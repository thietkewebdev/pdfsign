import { prisma } from "@/lib/prisma";
import { PLAN_DURATION_DAYS, getPlanDef, type PlanId } from "@/lib/plans";

/**
 * Activate (or extend) a paid plan for a user. If the user already has the same
 * active plan, the new period stacks on top of the remaining time; otherwise it
 * starts now. Free plan clears the expiry.
 */
export async function activatePlan(
  userId: string,
  planId: PlanId,
  durationDays: number = PLAN_DURATION_DAYS
): Promise<Date | null> {
  const def = getPlanDef(planId);

  if (!def.paid) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "free", planExpiresAt: null },
    });
    return null;
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true },
  });

  const now = Date.now();
  const stillActiveSamePlan =
    current?.plan === planId &&
    current?.planExpiresAt != null &&
    current.planExpiresAt.getTime() > now;

  const base = stillActiveSamePlan ? current!.planExpiresAt!.getTime() : now;
  const expiresAt = new Date(base + durationDays * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: { plan: planId, planExpiresAt: expiresAt },
  });

  return expiresAt;
}
