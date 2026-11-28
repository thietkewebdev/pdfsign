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

function fallbackError(status: number): string {
  if (status === 401) return "Chưa đăng nhập hoặc phiên đã hết";
  if (status === 403) return "Không có quyền";
  if (status === 404) return "Không tìm thấy";
  if (status === 413) return "File quá lớn";
  if (status === 429) return "Quá nhiều yêu cầu, thử lại sau";
  if (status >= 500) return "Lỗi máy chủ, thử lại sau";
  return `Lỗi (${status})`;
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
    // Non-JSON body (e.g. proxy HTML error page): don't show raw markup to users.
    data = res.ok ? { error: text } : null;
  }
  if (!res.ok) {
    const err = (data as { error?: string; errorCode?: string }) || {};
    throw new ApiError(err.error || fallbackError(res.status), res.status, err.errorCode);
  }
  return data as T;
}

export type User = {
  id: string;
  email: string;
  name?: string | null;
  plan?: string;
  role?: string;
  quota?: {
    canSign?: boolean;
    upgradeRequired?: boolean;
    trialRemaining?: number;
    remaining?: number | null;
  };
};
export type Doc = {
  id: string;
  publicId: string;
  title?: string | null;
  version: number;
  createdAt?: string;
  fileUrl?: string;
  status?: string;
  statusLabel?: string;
  expiresAt?: string | null;
  retentionHours?: number;
  retentionLabel?: string;
  remainingSeconds?: number | null;
};

/** Fallback when API has no statusLabel yet. */
export function documentStatusLabel(status?: string, version?: number): string {
  const s = (status || "ACTIVE").toUpperCase();
  if (s === "EXPIRED" || s === "PURGED") return "Đã xóa";
  if (s === "SIGNED" || (s === "ACTIVE" && (version || 1) > 1)) return "Đã ký";
  if (s === "ACTIVE") return "Chờ ký";
  return "Chờ ký";
}

export function formatRemaining(secs?: number | null): string {
  if (secs == null) return "";
  if (secs <= 0) return "Sắp xóa";
  const h = Math.floor(secs / 3600);
  const d = Math.floor(h / 24);
  if (d >= 1) return `còn ${d} ngày ${h % 24} giờ`;
  if (h >= 1) return `còn ${h} giờ`;
  const m = Math.max(1, Math.floor(secs / 60));
  return `còn ${m} phút`;
}
