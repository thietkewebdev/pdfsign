"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (
      command: string,
      targetId: string,
      config?: Record<string, unknown>
    ) => void;
  }
}

export function GA4() {
  const pathname = usePathname();
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;

  useEffect(() => {
    if (!ga4Id || typeof window.gtag !== "function") return;
    window.gtag("config", ga4Id, { page_path: pathname });
  }, [ga4Id, pathname]);

  return null;
}
