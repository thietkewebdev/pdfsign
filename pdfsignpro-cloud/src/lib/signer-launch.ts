"use client";

export interface SignerLaunchOptions {
  deepLink: string;
  fallbackDelayMs?: number;
  onFallback: () => void;
}

const SIGNER_OPENED_KEY = "pdfsignpro.signer_opened_once";

export function isWindowsClient(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /windows/i.test(ua) || /^win/i.test(platform);
}

export function isHttpsClient(): boolean {
  if (typeof window === "undefined") return true;
  const p = window.location.protocol;
  return p === "https:" || p === "http:" || p === "file:";
}

export function hasOpenedSignerBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIGNER_OPENED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Try opening desktop signer via deep link.
 * If the tab does not get backgrounded shortly after launch, trigger fallback UI.
 */
export function launchSignerWithFallback({
  deepLink,
  fallbackDelayMs = 2500,
  onFallback,
}: SignerLaunchOptions): void {
  let userLeftTab = false;

  const onVisibilityChange = () => {
    if (document.hidden) {
      userLeftTab = true;
      try {
        window.localStorage.setItem(SIGNER_OPENED_KEY, "1");
      } catch {
        // Ignore storage failures (private mode, denied storage, ...)
      }
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.location.href = deepLink;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!userLeftTab) onFallback();
  }, fallbackDelayMs);
}
