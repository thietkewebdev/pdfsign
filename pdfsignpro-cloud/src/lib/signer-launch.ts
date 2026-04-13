"use client";

export interface SignerLaunchOptions {
  deepLink: string;
  fallbackDelayMs?: number;
  onFallback: () => void;
}

export function isWindowsClient(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /windows/i.test(ua) || /^win/i.test(platform);
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
    if (document.hidden) userLeftTab = true;
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.location.href = deepLink;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!userLeftTab) onFallback();
  }, fallbackDelayMs);
}
