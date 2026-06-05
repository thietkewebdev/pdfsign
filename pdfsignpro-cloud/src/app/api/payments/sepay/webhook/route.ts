import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSepayConfig, verifyWebhookAuth, normalizeContent } from "@/lib/sepay";
import { activatePlan } from "@/lib/subscription";
import { isPlanId } from "@/lib/plans";
import { recordAdminAnalyticsEvent } from "@/lib/admin-events";

/**
 * SePay webhook for incoming bank transfers.
 * Docs: https://docs.sepay.vn/tich-hop-webhooks.html
 *
 * Auth: header "Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>".
 * On a matching incoming transaction we mark the Payment PAID and activate the plan.
 */
export async function POST(request: Request) {
  const cfg = getSepayConfig();
  if (!cfg) {
    return NextResponse.json({ success: false, error: "not_configured" }, { status: 503 });
  }

  if (!verifyWebhookAuth(request.headers.get("authorization"), cfg)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "bad_json" }, { status: 400 });
  }

  try {
    const transferType = String(payload.transferType ?? "").toLowerCase();
    // Only credit (incoming) transactions can pay an order.
    if (transferType && transferType !== "in") {
      return NextResponse.json({ success: true, skipped: "not_incoming" });
    }

    const sepayTxId =
      payload.id != null ? String(payload.id) : payload.referenceCode != null ? String(payload.referenceCode) : null;
    const amount = Number(payload.transferAmount ?? payload.amount ?? 0);
    const content = String(payload.content ?? payload.description ?? payload.code ?? "");

    // Idempotency: if we already recorded this SePay transaction, ack and stop.
    if (sepayTxId) {
      const existing = await prisma.payment.findUnique({ where: { sepayTxId } });
      if (existing) {
        return NextResponse.json({ success: true, alreadyProcessed: true });
      }
    }

    // Extract our payment code from the (mangled) bank content.
    const normalized = normalizeContent(content);
    const codeMatch = normalized.match(/PDF[A-Z0-9]{12}/);
    const explicitCode =
      typeof payload.code === "string" && payload.code ? normalizeContent(payload.code) : null;
    const code = codeMatch?.[0] ?? (explicitCode && explicitCode.startsWith("PDF") ? explicitCode : null);

    if (!code) {
      return NextResponse.json({ success: true, skipped: "no_code" });
    }

    const payment = await prisma.payment.findUnique({ where: { code } });
    if (!payment) {
      return NextResponse.json({ success: true, skipped: "payment_not_found" });
    }

    if (payment.status === "PAID") {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    // Require the received amount to cover the plan price.
    if (amount < payment.amountVnd) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { sepayRefCode: String(payload.referenceCode ?? ""), paidAmount: amount },
      });
      return NextResponse.json({ success: true, skipped: "insufficient_amount" });
    }

    // Mark paid + activate plan atomically-ish.
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidAmount: amount,
        sepayTxId: sepayTxId ?? undefined,
        sepayRefCode: payload.referenceCode != null ? String(payload.referenceCode) : undefined,
      },
    });

    if (isPlanId(payment.plan)) {
      await activatePlan(payment.userId, payment.plan);
    }

    await recordAdminAnalyticsEvent({
      eventType: "payment.completed",
      subjectUserId: payment.userId,
      metadata: { plan: payment.plan, amount, code },
    }).catch(() => undefined);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/payments/sepay/webhook error:", err);
    return NextResponse.json({ success: false, error: "server_error" }, { status: 500 });
  }
}
