import { createHash, randomBytes } from "crypto";

export function generateJobToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashJobToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyJobToken(token: string, storedHash: string): boolean {
  const hash = hashJobToken(token);
  return hash === storedHash;
}
