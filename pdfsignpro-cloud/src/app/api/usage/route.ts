import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMonthlyUsage, getResetAt, FREE_MONTHLY_LIMIT } from "@/lib/usage";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const used = await getMonthlyUsage(session.user.id);
    const resetAt = getResetAt();

    const recentJobs = await prisma.signingJob.findMany({
      where: {
        status: "COMPLETED",
        OR: [
          { document: { userId: session.user.id } },
          { contractSigner: { contract: { userId: session.user.id } } },
        ],
      },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        id: true,
        completedAt: true,
        document: { select: { publicId: true, title: true } },
        contractSigner: {
          select: {
            name: true,
            contract: { select: { title: true, id: true } },
          },
        },
      },
    });

    return NextResponse.json({
      used,
      limit: FREE_MONTHLY_LIMIT,
      resetAt: resetAt.toISOString(),
      plan: "free",
      recent: recentJobs.map((j) => ({
        id: j.id,
        completedAt: j.completedAt?.toISOString() ?? null,
        documentTitle: j.document.title ?? "PDF",
        documentPublicId: j.document.publicId,
        contractTitle: j.contractSigner?.contract.title,
        contractId: j.contractSigner?.contract.id,
        signerName: j.contractSigner?.name,
      })),
    });
  } catch (err) {
    console.error("GET /api/usage error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
