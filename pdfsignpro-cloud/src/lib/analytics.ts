"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackGaEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | null>
): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  try {
    window.gtag("event", eventName, params ?? {});
  } catch {
    // Never block user flow because of analytics errors.
  }
}
