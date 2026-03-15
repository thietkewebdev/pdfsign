import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent } from "@/lib/admin-events";

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const monthStart = startOfMonth();

    const [
      totalUsers,
      verifiedUsers,
      totalDocuments,
      totalContracts,
      totalCompletedJobs,
      monthlyUploads,
      monthlyContracts,
      monthlyCompletedJobs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.document.count(),
      prisma.contract.count(),
      prisma.signingJob.count({ where: { status: "COMPLETED" } }),
      prisma.documentVersion.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.contract.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.signingJob.count({
        where: { status: "COMPLETED", completedAt: { gte: monthStart } },
      }),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.overview.view",
      actorUserId: session.user.id,
    });

    return NextResponse.json({
      kpis: {
        totalUsers,
        verifiedUsers,
        totalDocuments,
        totalContracts,
        totalCompletedJobs,
        monthlyUploads,
        monthlyContracts,
        monthlyCompletedJobs,
      },
    });
  } catch (err) {
    console.error("GET /api/admin/overview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
