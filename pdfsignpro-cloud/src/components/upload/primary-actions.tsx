"use client";

import Link from "next/link";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrimaryActions() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href="/api/signer/download">
          <Monitor className="size-4" />
          Tải PDFSignPro Signer (Windows)
        </a>
      </Button>
      <Link
        href="/signer"
        className="text-sm text-muted-foreground underline hover:text-foreground transition-colors"
      >
        Hướng dẫn cài đặt
      </Link>
    </div>
  );
}
