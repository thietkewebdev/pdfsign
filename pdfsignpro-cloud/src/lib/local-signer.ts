"use client";

export interface LocalSignerCert {
  index: number;
  subjectO?: string | null;
  subjectCN?: string | null;
  issuerCN?: string | null;
  serial: string;
  validTo: string;
  displayName: string;
}

interface LocalSignerCertResponse {
  ok: boolean;
  certs?: LocalSignerCert[];
  count?: number;
  error?: string;
}

interface LocalSignerHealthResponse {
  ok: boolean;
  app?: string;
  version?: string;
}

const LOCAL_SIGNER_BASE = "http://127.0.0.1:17886";
const REQ_TIMEOUT_MS = 1800;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("LOCAL_TIMEOUT")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

export async function probeLocalSigner(): Promise<LocalSignerHealthResponse | null> {
  try {
    const res = await withTimeout(fetch(`${LOCAL_SIGNER_BASE}/health`, { method: "GET" }), REQ_TIMEOUT_MS);
    if (!res.ok) return null;
    const json = (await res.json()) as LocalSignerHealthResponse;
    return json?.ok ? json : null;
  } catch {
    return null;
  }
}

export async function fetchLocalSignerCerts(pin: string): Promise<LocalSignerCert[]> {
  const res = await withTimeout(
    fetch(`${LOCAL_SIGNER_BASE}/certs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }),
    REQ_TIMEOUT_MS * 2
  );

  const json = (await res.json().catch(() => ({}))) as LocalSignerCertResponse;
  if (!res.ok || !json.ok) {
    throw new Error(json.error || "Không lấy được danh sách chứng thư từ Signer.");
  }
  return json.certs ?? [];
}
