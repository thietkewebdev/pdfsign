import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent, recordAdminAuditLog } from "@/lib/admin-events";
import { sendSigningInvitation } from "@/lib/email";
import { logContractEvent } from "@/lib/contract-events";

const UpdateContractSchema = z.object({
  contractId: z.string().min(1),
  action: z.enum(["cancel", "remind", "extendExpiry"]),
  expiresAt: z.string().optional(),
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
              { user: { email: { contains: search, mode: "insensitive" as const } } },
              {
                signers: {
                  some: {
                    email: { contains: search, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    };

    const [total, contracts] = await Promise.all([
      prisma.contract.count({ where }),
      prisma.contract.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          document: { select: { title: true, publicId: true } },
          signers: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              email: true,
              name: true,
              order: true,
              status: true,
              invitedAt: true,
              completedAt: true,
            },
          },
        },
      }),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.contracts.view",
      actorUserId: session.user.id,
      metadata: { page, pageSize, hasSearch: Boolean(search), status: status ?? null },
    });

    return NextResponse.json({
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      contracts: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        completedAt: c.completedAt?.toISOString() ?? null,
        owner: c.user,
        document: c.document,
        signers: c.signers.map((s) => ({
          ...s,
          invitedAt: s.invitedAt?.toISOString() ?? null,
          completedAt: s.completedAt?.toISOString() ?? null,
        })),
        signedCount: c.signers.filter((s) => s.status === "COMPLETED").length,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/contracts error:", err);
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
    const parsed = UpdateContractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { contractId, action, expiresAt } = parsed.data;
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        signers: true,
      },
    });
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (action === "cancel") {
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "EXPIRED" },
      });
      await logContractEvent(
        contractId,
        "CANCELED",
        session.user.email ?? "admin",
        "Hủy hợp đồng bởi admin"
      );
      await Promise.all([
        recordAdminAuditLog({
          actorUserId: session.user.id,
          action: "cancel",
          resource: "contract",
          resourceId: contractId,
          detail: `Admin canceled contract ${contract.title}`,
        }),
        recordAdminAnalyticsEvent({
          eventType: "admin.contract.cancel",
          actorUserId: session.user.id,
        }),
      ]);
      return NextResponse.json({ success: true });
    }

    if (action === "extendExpiry") {
      if (!expiresAt) {
        return NextResponse.json({ error: "expiresAt is required" }, { status: 400 });
      }
      const nextExpiresAt = new Date(expiresAt);
      if (Number.isNaN(nextExpiresAt.getTime())) {
        return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
      }
      await prisma.contract.update({
        where: { id: contractId },
        data: { expiresAt: nextExpiresAt },
      });
      await logContractEvent(
        contractId,
        "REMINDED",
        session.user.email ?? "admin",
        `Gia hạn hạn ký đến ${nextExpiresAt.toISOString()} bởi admin`
      );
      await Promise.all([
        recordAdminAuditLog({
          actorUserId: session.user.id,
          action: "extendExpiry",
          resource: "contract",
          resourceId: contractId,
          detail: `Admin extended contract expiry to ${nextExpiresAt.toISOString()}`,
        }),
        recordAdminAnalyticsEvent({
          eventType: "admin.contract.extendExpiry",
          actorUserId: session.user.id,
        }),
      ]);
      return NextResponse.json({ success: true });
    }

    if (action === "remind") {
      const currentSigner = contract.signers.find((s) => s.status === "INVITED");
      if (!currentSigner) {
        return NextResponse.json(
          { error: "No signer awaiting signature" },
          { status: 400 }
        );
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const signingUrl = `${appUrl}/contract/${contract.id}?token=${currentSigner.token}`;
      await sendSigningInvitation(
        currentSigner.email,
        currentSigner.name,
        contract.title,
        signingUrl,
        session.user.name ?? "Admin"
      );
      await logContractEvent(
        contractId,
        "REMINDED",
        session.user.email ?? "admin",
        `Admin nhắc ký ${currentSigner.name} (${currentSigner.email})`
      );
      await Promise.all([
        recordAdminAuditLog({
          actorUserId: session.user.id,
          action: "remind",
          resource: "contract",
          resourceId: contractId,
          detail: `Admin reminded signer ${currentSigner.email}`,
        }),
        recordAdminAnalyticsEvent({
          eventType: "admin.contract.remind",
          actorUserId: session.user.id,
        }),
      ]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/admin/contracts error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
