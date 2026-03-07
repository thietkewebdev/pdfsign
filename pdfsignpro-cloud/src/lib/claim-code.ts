import { createHash, randomBytes } from "crypto";

/** 8 hex chars = 4 bytes entropy */
export function generateClaimCode(): string {
  return randomBytes(4).toString("hex");
}

export function hashClaimCode(code: string): string {
  return createHash("sha256").update(code.toLowerCase().trim()).digest("hex");
}

export function verifyClaimCode(code: string, storedHash: string): boolean {
  const normalized = code.toLowerCase().trim();
  if (!/^[a-f0-9]{6,10}$/.test(normalized)) return false;
  return hashClaimCode(normalized) === storedHash;
}
