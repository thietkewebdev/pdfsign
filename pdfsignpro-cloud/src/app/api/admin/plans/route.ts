import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent } from "@/lib/admin-events";

const PLAN_QUOTA_BYTES: Record<string, number> = {
  free: 100 * 1024 * 1024,
  pro: 1024 * 1024 * 1024,
  business: 5 * 1024 * 1024 * 1024,
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const [usersByPlan, users] = await Promise.all([
      prisma.user.groupBy({
        by: ["plan"],
        _count: { _all: true },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          documents: {
            select: {
              versions: {
                select: { sizeBytes: true },
              },
            },
          },
        },
      }),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.plans.view",
      actorUserId: session.user.id,
    });

    const usersWithStorage = users.map((u) => {
      const usedBytes = u.documents.reduce(
        (total, d) => total + d.versions.reduce((sum, v) => sum + v.sizeBytes, 0),
        0
      );
      const quota = PLAN_QUOTA_BYTES[u.plan] ?? PLAN_QUOTA_BYTES.free;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        plan: u.plan,
        usedBytes,
        quotaBytes: quota,
        overQuota: usedBytes > quota,
      };
    });

    return NextResponse.json({
      distribution: usersByPlan.map((p) => ({
        plan: p.plan,
        count: p._count._all,
      })),
      overQuotaUsers: usersWithStorage
        .filter((u) => u.overQuota)
        .sort((a, b) => b.usedBytes - a.usedBytes)
        .slice(0, 50),
    });
  } catch (err) {
    console.error("GET /api/admin/plans error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
