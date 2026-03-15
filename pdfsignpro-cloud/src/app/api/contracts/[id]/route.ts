import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
    const matchedSigner = token
      ? contract.signers.find((s) => s.token === token)
      : null;

    if (!isOwner && !matchedSigner) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const signers = contract.signers.map((s) => ({
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
      signedCount: signers.filter((s) => s.status === "COMPLETED").length,
      totalSigners: signers.length,
      canSign: matchedSigner
        ? matchedSigner.status === "INVITED"
        : false,
      currentSignerToken: matchedSigner?.token ?? null,
    });
  } catch (err) {
    console.error("GET /api/contracts/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
