import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent } from "@/lib/admin-events";

function startOfRange(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const days = Math.min(
      90,
      Math.max(7, Number(request.nextUrl.searchParams.get("days") ?? "30"))
    );
    const from = startOfRange(days);

    const [recentUploads, recentCompletedJobs, topUsersByJobs] = await Promise.all([
      prisma.documentVersion.findMany({
        where: { createdAt: { gte: from } },
        select: { createdAt: true, sizeBytes: true },
      }),
      prisma.signingJob.findMany({
        where: { status: "COMPLETED", completedAt: { gte: from } },
        select: {
          completedAt: true,
          document: {
            select: {
              userId: true,
            },
          },
          contractSigner: {
            select: {
              contract: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          _count: {
            select: {
              documents: true,
              contracts: true,
            },
          },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.usage.view",
      actorUserId: session.user.id,
    });

    const uploadsByDay = new Map<string, { count: number; bytes: number }>();
    for (const item of recentUploads) {
      const key = isoDateKey(item.createdAt);
      const current = uploadsByDay.get(key) ?? { count: 0, bytes: 0 };
      current.count += 1;
      current.bytes += item.sizeBytes;
      uploadsByDay.set(key, current);
    }

    const jobsByDay = new Map<string, number>();
    for (const job of recentCompletedJobs) {
      if (!job.completedAt) continue;
      const key = isoDateKey(job.completedAt);
      jobsByDay.set(key, (jobsByDay.get(key) ?? 0) + 1);
    }

    return NextResponse.json({
      rangeDays: days,
      timeline: {
        uploads: Array.from(uploadsByDay.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, v]) => ({ day, count: v.count, bytes: v.bytes })),
        completedJobs: Array.from(jobsByDay.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, count]) => ({ day, count })),
      },
      topUsersByRecentActivity: topUsersByJobs.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        documents: u._count.documents,
        contracts: u._count.contracts,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/usage error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
