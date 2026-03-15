import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent } from "@/lib/admin-events";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const [driverGroups, userDocuments, totalVersions] = await Promise.all([
      prisma.documentVersion.groupBy({
        by: ["storageDriver"],
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      prisma.document.findMany({
        select: {
          id: true,
          userId: true,
          user: { select: { email: true, name: true } },
          versions: { select: { sizeBytes: true } },
        },
      }),
      prisma.documentVersion.count(),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.storage.view",
      actorUserId: session.user.id,
    });

    const byUser = new Map<
      string,
      { userId: string; email: string | null; name: string | null; bytes: number; versions: number }
    >();
    for (const d of userDocuments) {
      const key = d.userId ?? "anonymous";
      const current = byUser.get(key) ?? {
        userId: key,
        email: d.user?.email ?? null,
        name: d.user?.name ?? null,
        bytes: 0,
        versions: 0,
      };
      for (const v of d.versions) {
        current.bytes += v.sizeBytes;
        current.versions += 1;
      }
      byUser.set(key, current);
    }

    return NextResponse.json({
      totalVersions,
      byDriver: driverGroups.map((g) => ({
        storageDriver: g.storageDriver,
        versionCount: g._count._all,
        totalBytes: g._sum.sizeBytes ?? 0,
      })),
      byUser: Array.from(byUser.values())
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 100),
    });
  } catch (err) {
    console.error("GET /api/admin/storage error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
