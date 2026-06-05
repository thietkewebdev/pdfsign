/**
 * SePay (https://sepay.vn) bank-transfer payment helpers.
 *
 * Flow:
 *  1. We create a Payment with a unique alphanumeric `code`.
 *  2. The user transfers money with that code in the transfer content, shown via
 *     a VietQR image (qr.sepay.vn) prefilled with amount + content.
 *  3. SePay calls our webhook when a matching incoming transaction arrives; we
 *     find the Payment by its code inside the content and activate the plan.
 *
 * Required env vars:
 *  - SEPAY_ACCOUNT_NUMBER   Bank account number that receives the money.
 *  - SEPAY_BANK             Bank short code for VietQR (e.g. MBBank, TPBank, Vietcombank, ACB...).
 *  - SEPAY_ACCOUNT_NAME     Account holder name (display only).
 *  - SEPAY_WEBHOOK_API_KEY  API key configured in SePay → matched against the
 *                           "Authorization: Apikey <key>" header on the webhook.
 */

import { randomBytes } from "crypto";

export interface SepayConfig {
  accountNumber: string;
  bank: string;
  accountName: string;
  webhookApiKey: string;
}

export function getSepayConfig(): SepayConfig | null {
  const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER?.trim();
  const bank = process.env.SEPAY_BANK?.trim();
  if (!accountNumber || !bank) return null;
  return {
    accountNumber,
    bank,
    accountName: process.env.SEPAY_ACCOUNT_NAME?.trim() ?? "",
    webhookApiKey: process.env.SEPAY_WEBHOOK_API_KEY?.trim() ?? "",
  };
}

export function isSepayConfigured(): boolean {
  return getSepayConfig() !== null;
}

/**
 * Generate a unique, bank-memo-safe payment code. Uppercase A-Z0-9 only so it
 * survives banks that strip punctuation/lowercase from transfer content.
 */
export function generatePaymentCode(): string {
  const raw = randomBytes(6).toString("hex").toUpperCase(); // 12 hex chars
  return `PDF${raw}`;
}

/** Strip everything except A-Z0-9 and uppercase (matches how banks mangle memos). */
export function normalizeContent(content: string): string {
  return content.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True if a SePay transfer content contains our payment code. */
export function contentMatchesCode(content: string, code: string): boolean {
  return normalizeContent(content).includes(normalizeContent(code));
}

/**
 * Build the VietQR image URL (qr.sepay.vn) for a payment.
 * `download=false` returns an inline image suitable for <img src>.
 */
export function buildSepayQrUrl(cfg: SepayConfig, amountVnd: number, code: string): string {
  const params = new URLSearchParams({
    acc: cfg.accountNumber,
    bank: cfg.bank,
    amount: String(amountVnd),
    des: code,
    template: "compact",
  });
  return `https://qr.sepay.vn/img?${params.toString()}`;
}

/**
 * Verify the webhook Authorization header. SePay sends "Apikey <key>".
 * When no key is configured we reject (fail closed) to avoid unauthenticated activation.
 */
export function verifyWebhookAuth(authHeader: string | null, cfg: SepayConfig): boolean {
  if (!cfg.webhookApiKey) return false;
  if (!authHeader) return false;
  const expected = `apikey ${cfg.webhookApiKey}`.toLowerCase();
  return authHeader.trim().toLowerCase() === expected;
}
