import type { Session } from "next-auth";
import { NextResponse } from "next/server";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminEmailWhitelist(): string[] {
  const raw = process.env.ADMIN_EMAIL_WHITELIST ?? "";
  return raw
    .split(",")
    .map((v) => normalizeEmail(v))
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const allow = getAdminEmailWhitelist();
  if (allow.length === 0) return false;
  return allow.includes(normalizeEmail(email));
}

export function isAdminSession(session: Session | null): boolean {
  return isAdminEmail(session?.user?.email ?? null);
}

export function unauthorizedAdminResponse() {
  return NextResponse.json({ error: "Admin access required" }, { status: 403 });
}
