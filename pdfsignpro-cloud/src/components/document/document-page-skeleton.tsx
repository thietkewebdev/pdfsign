"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function DocumentPageSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_280px] lg:h-full">
          <div className="border-r border-border p-4 space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex items-center justify-center bg-muted/30">
            <Skeleton className="h-[80vh] w-[600px] max-w-full" />
          </div>
          <div className="border-l border-border p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
        <div className="lg:hidden p-4 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[50vh] w-full" />
        </div>
      </div>
    </div>
  );
}
