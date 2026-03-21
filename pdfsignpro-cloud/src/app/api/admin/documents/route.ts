import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent, recordAdminAuditLog } from "@/lib/admin-events";
import { getStorageDriver } from "@/storage";

const UpdateDocumentSchema = z.object({
  publicId: z.string().min(1),
  action: z.enum(["archive", "restore"]),
});

const DeleteDocumentSchema = z.object({
  publicId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const status = request.nextUrl.searchParams.get("status")?.trim();
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? "20"))
    );
    const skip = (page - 1) * pageSize;

    const where = {
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { publicId: { contains: search, mode: "insensitive" as const } },
              { user: { email: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    };

    const [total, documents] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { version: true, sizeBytes: true, storageKey: true, createdAt: true },
          },
          _count: {
            select: { jobs: true },
          },
        },
      }),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.documents.view",
      actorUserId: session.user.id,
      metadata: { page, pageSize, hasSearch: Boolean(search), status: status ?? null },
    });

    return NextResponse.json({
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      documents: documents.map((d) => ({
        id: d.id,
        publicId: d.publicId,
        title: d.title,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        owner: d.user,
        latestVersion: d.versions[0]
          ? {
              version: d.versions[0].version,
              sizeBytes: d.versions[0].sizeBytes,
              storageKey: d.versions[0].storageKey,
              createdAt: d.versions[0].createdAt.toISOString(),
            }
          : null,
        signingJobCount: d._count.jobs,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/documents error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const body = await request.json();
    const parsed = UpdateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { publicId, action } = parsed.data;
    await prisma.document.update({
      where: { publicId },
      data: { status: action === "archive" ? "ARCHIVED" : "ACTIVE" },
    });
    await Promise.all([
      recordAdminAuditLog({
        actorUserId: session.user.id,
        action,
        resource: "document",
        resourceId: publicId,
        detail: `Admin ${action} document ${publicId}`,
      }),
      recordAdminAnalyticsEvent({
        eventType: `admin.document.${action}`,
        actorUserId: session.user.id,
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/admin/documents error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const body = await request.json();
    const parsed = DeleteDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { publicId } = parsed.data;
    const document = await prisma.document.findUnique({
      where: { publicId },
      include: {
        versions: {
          select: { storageKey: true },
        },
      },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const storage = getStorageDriver();
    if (storage.delete) {
      for (const v of document.versions) {
        try {
          await storage.delete(v.storageKey);
        } catch {
          // Keep deletion idempotent even if object is already missing.
        }
      }
    }

    await prisma.document.delete({ where: { id: document.id } });
    await Promise.all([
      recordAdminAuditLog({
        actorUserId: session.user.id,
        action: "delete",
        resource: "document",
        resourceId: publicId,
        detail: `Admin delete document ${publicId}`,
      }),
      recordAdminAnalyticsEvent({
        eventType: "admin.document.delete",
        actorUserId: session.user.id,
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/admin/documents error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
