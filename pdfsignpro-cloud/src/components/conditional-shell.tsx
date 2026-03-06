"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSignPage = pathname?.startsWith("/sign");

  if (isSignPage) {
    return <div className="min-h-screen flex flex-col bg-background">{children}</div>;
  }

  return <AppShell>{children}</AppShell>;
}
