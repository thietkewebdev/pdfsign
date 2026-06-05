import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS, getPlanDef, isPlanId } from "@/lib/plans";
import {
  getSepayConfig,
  generatePaymentCode,
  buildSepayQrUrl,
} from "@/lib/sepay";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const CreatePaymentSchema = z.object({
  plan: z.string().refine((p) => isPlanId(p) && PLANS[p].paid, {
    message: "Gói không hợp lệ",
  }),
});

// How long a generated QR / payment window stays valid.
const PAYMENT_WINDOW_MINUTES = 30;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }

    const rl = rateLimit(`payments:${getClientIp(request)}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const cfg = getSepayConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "Thanh toán online chưa được cấu hình. Vui lòng liên hệ hỗ trợ." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = CreatePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Gói không hợp lệ" }, { status: 400 });
    }

    const planDef = getPlanDef(parsed.data.plan);

    // Reuse an existing fresh PENDING payment for the same plan to avoid clutter.
    let payment = await prisma.payment.findFirst({
      where: {
        userId: session.user.id,
        plan: planDef.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!payment) {
      const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000);
      // Generate a unique code (retry on the rare unique collision).
      let code = generatePaymentCode();
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.payment.findUnique({ where: { code } });
        if (!exists) break;
        code = generatePaymentCode();
      }
      payment = await prisma.payment.create({
        data: {
          userId: session.user.id,
          plan: planDef.id,
          amountVnd: planDef.priceVnd,
          code,
          status: "PENDING",
          provider: "sepay",
          expiresAt,
        },
      });
    }

    return NextResponse.json({
      id: payment.id,
      code: payment.code,
      plan: payment.plan,
      planName: planDef.name,
      amountVnd: payment.amountVnd,
      qrUrl: buildSepayQrUrl(cfg, payment.amountVnd, payment.code),
      bank: cfg.bank,
      accountNumber: cfg.accountNumber,
      accountName: cfg.accountName,
      transferContent: payment.code,
      status: payment.status,
      expiresAt: payment.expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("POST /api/payments error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
