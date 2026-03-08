"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentEmptyStateProps {
  title?: string;
  description?: string;
}

export function DocumentEmptyState({
  title = "Không tìm thấy tài liệu",
  description = "Tài liệu không tồn tại hoặc đã bị xóa.",
}: DocumentEmptyStateProps) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-6 p-8">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <FileQuestion className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      </div>
      <Button asChild>
        <Link href="/">Tải PDF lên</Link>
      </Button>
    </div>
  );
}
