const FP_KEY = "pdfsign_fp";

export function deviceFingerprint(): string {
  try {
    let fp = localStorage.getItem(FP_KEY);
    if (!fp) {
      fp =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `fp_${Date.now()}_${Math.random().toString(16).slice(2)}`) +
        `|${navigator.userAgent.slice(0, 80)}`;
      localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  } catch {
    return `anon_${Date.now()}`;
  }
}

export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("X-Pdfsign-Fingerprint")) {
    headers.set("X-Pdfsign-Fingerprint", deviceFingerprint());
  }
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = (data as { error?: string; errorCode?: string }) || {};
    throw new ApiError(err.error || res.statusText, res.status, err.errorCode);
  }
  return data as T;
}

export type User = { id: string; email: string; name?: string | null; plan?: string };
export type Doc = {
  id: string;
  publicId: string;
  title?: string | null;
  version: number;
  createdAt?: string;
  fileUrl?: string;
  status?: string;
};
