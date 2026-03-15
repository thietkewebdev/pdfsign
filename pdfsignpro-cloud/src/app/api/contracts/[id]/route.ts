import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logContractEvent } from "@/lib/contract-events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.nextUrl.searchParams.get("token");

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        signers: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            email: true,
            name: true,
            order: true,
            status: true,
            token: true,
            templateId: true,
            invitedAt: true,
            completedAt: true,
          },
        },
        document: {
          select: {
            id: true,
            publicId: true,
            title: true,
            versions: {
              orderBy: { version: "desc" },
              take: 1,
              select: { version: true, storageKey: true },
            },
          },
        },
        user: {
          select: { name: true, email: true },
        },
        events: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            actor: true,
            detail: true,
            createdAt: true,
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    const session = await auth();
    const isOwner = session?.user?.id === contract.userId;
    const tokenMatchedSigner = token
      ? contract.signers.find((s: { token: string }) => s.token === token)
      : null;
    const sessionEmail = session?.user?.email?.trim().toLowerCase();
    const emailMatchedSigner =
      !tokenMatchedSigner && sessionEmail
        ? contract.signers.find(
            (s: { email: string }) => s.email?.toLowerCase() === sessionEmail
          )
        : null;
    const matchedSigner = tokenMatchedSigner ?? emailMatchedSigner ?? null;

    if (!isOwner && !matchedSigner) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const signers = contract.signers.map((s: {
      id: string;
      email: string;
      name: string;
      order: number;
      status: string;
      templateId: string;
      invitedAt: Date | null;
      completedAt: Date | null;
    }) => ({
      id: s.id,
      email: isOwner ? s.email : maskEmail(s.email),
      name: s.name,
      order: s.order,
      status: s.status,
      templateId: s.templateId,
      invitedAt: s.invitedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      isCurrentUser: matchedSigner?.id === s.id,
    }));

    return NextResponse.json({
      id: contract.id,
      title: contract.title,
      message: contract.message,
      status: contract.status,
      createdAt: contract.createdAt.toISOString(),
      expiresAt: contract.expiresAt.toISOString(),
      completedAt: contract.completedAt?.toISOString() ?? null,
      owner: { name: contract.user.name, email: isOwner ? contract.user.email : null },
      document: {
        id: contract.document.id,
        publicId: contract.document.publicId,
        title: contract.document.title,
        latestVersion: contract.document.versions[0]?.version ?? 1,
      },
      signers,
      signedCount: signers.filter((s: { status: string }) => s.status === "COMPLETED").length,
      totalSigners: signers.length,
      canSign: matchedSigner
        ? matchedSigner.status === "INVITED"
        : false,
      currentSignerToken: matchedSigner?.token ?? null,
      isOwner,
      events: isOwner
        ? contract.events.map((e: {
            id: string;
            type: string;
            actor: string | null;
            detail: string | null;
            createdAt: Date;
          }) => ({
            id: e.id,
            type: e.type,
            actor: e.actor,
            detail: e.detail,
            createdAt: e.createdAt.toISOString(),
          }))
        : [],
    });
  } catch (err) {
    console.error("GET /api/contracts/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: { signers: true },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    if (contract.userId !== session.user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (action === "cancel") {
      if (contract.status === "COMPLETED") {
        return NextResponse.json({ error: "Cannot cancel a completed contract" }, { status: 400 });
      }

      await prisma.contract.update({
        where: { id },
        data: { status: "EXPIRED" },
      });

      await logContractEvent(id, "CANCELED", session.user.name ?? session.user.email ?? undefined, "Hủy hợp đồng bởi chủ sở hữu");

      return NextResponse.json({ success: true, status: "EXPIRED" });
    }

    if (action === "remind") {
      const currentSigner = contract.signers.find((s: { status: string }) => s.status === "INVITED");
      if (!currentSigner) {
        return NextResponse.json({ error: "No signer awaiting signature" }, { status: 400 });
      }

      const { sendSigningInvitation } = await import("@/lib/email");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const signingUrl = `${appUrl}/contract/${contract.id}?token=${currentSigner.token}`;

      try {
        await sendSigningInvitation(
          currentSigner.email,
          currentSigner.name,
          contract.title,
          signingUrl,
          session.user.name ?? undefined
        );
      } catch (emailErr) {
        console.error("Failed to send reminder:", emailErr);
        return NextResponse.json({ error: "Failed to send reminder email" }, { status: 500 });
      }

      await logContractEvent(id, "REMINDED", session.user.name ?? session.user.email ?? undefined, `Nhắc nhở ${currentSigner.name} (${currentSigner.email})`);

      return NextResponse.json({ success: true, remindedSigner: currentSigner.name });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/contracts/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
