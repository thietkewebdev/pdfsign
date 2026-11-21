export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
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
    const err = (data as { error?: string }) || {};
    throw new Error(err.error || res.statusText);
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
