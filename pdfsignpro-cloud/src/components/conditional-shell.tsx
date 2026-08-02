"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  // Legacy USB-token editor at /sign/[id] — not /sign-pdf marketing/tool page
  const isLegacySignPage = /^\/sign\/[^/]+$/.test(pathname);
  const isDocumentSigning = /^\/d\/[^/]+$/.test(pathname);
  const isSignPdfEditor =
    pathname === "/sign-pdf" || pathname.startsWith("/sign-pdf/");

  if (isLegacySignPage || isDocumentSigning || isSignPdfEditor) {
    return <div className="min-h-screen flex flex-col bg-background">{children}</div>;
  }

  return <AppShell>{children}</AppShell>;
}
