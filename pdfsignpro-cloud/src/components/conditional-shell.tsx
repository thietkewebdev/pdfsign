"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isSignPage = pathname.startsWith("/sign");
  const isDocumentSigning = /^\/d\/[^/]+$/.test(pathname);

  if (isSignPage || isDocumentSigning) {
    return <div className="min-h-screen flex flex-col bg-background">{children}</div>;
  }

  return <AppShell>{children}</AppShell>;
}
