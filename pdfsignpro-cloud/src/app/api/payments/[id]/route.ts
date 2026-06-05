import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanDef } from "@/lib/plans";

/** Poll a payment's status (owner only) so the upgrade UI can detect activation. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }

    const { id } = await params;
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.userId !== session.user.id) {
      return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
    }

    // Lazily mark expired (no background worker needed).
    let status = payment.status;
    if (status === "PENDING" && payment.expiresAt.getTime() < Date.now()) {
      status = "EXPIRED";
      await prisma.payment
        .update({ where: { id: payment.id }, data: { status } })
        .catch(() => undefined);
    }

    return NextResponse.json({
      id: payment.id,
      status,
      plan: payment.plan,
      planName: getPlanDef(payment.plan).name,
      amountVnd: payment.amountVnd,
      paidAt: payment.paidAt?.toISOString() ?? null,
      expiresAt: payment.expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("GET /api/payments/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
