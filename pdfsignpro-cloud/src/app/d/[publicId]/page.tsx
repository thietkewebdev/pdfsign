"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Download, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  mockDocument,
  mockSigners,
  mockVersions,
  mockThumbnails,
} from "@/lib/mock";

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "SIGNED"
      ? "success"
      : status === "ACTIVE"
        ? "warning"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

function SigningTimeline() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Signing timeline</h3>
      <ScrollArea className="h-[calc(100vh-12rem)]">
        <div className="space-y-4 pr-4">
          {mockSigners.map((signer) => (
            <div key={signer.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{signer.name}</span>
                <StatusBadge status={signer.status} />
              </div>
              <p className="text-xs text-muted-foreground">{signer.email}</p>
              {signer.signedAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(signer.signedAt).toLocaleString()} • {signer.ip}
                </p>
              )}
              <Separator />
            </div>
          ))}
          <h4 className="text-sm font-semibold text-foreground pt-2">
            Audit trail
          </h4>
          {mockVersions.map((v) => (
            <div key={v.id} className="space-y-1 text-xs">
              <p className="text-muted-foreground">{v.action}</p>
              <p className="text-muted-foreground">
                {new Date(v.timestamp).toLocaleString()} • {v.email} • {v.ip}
              </p>
              <Separator className="my-2" />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function PdfViewer() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Zoom out">
            <ZoomOut className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom in">
            <ZoomIn className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page 1 / {mockDocument.pageCount}
          </span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-border m-4">
        <p className="text-muted-foreground">PDF preview area</p>
      </div>
    </div>
  );
}

function ThumbnailsPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Pages</h3>
      <ScrollArea className="h-[calc(100vh-12rem)]">
        <div className="space-y-2 pr-2">
          {mockThumbnails.map((thumb) => (
            <div
              key={thumb.id}
              className="flex items-center gap-3 rounded-lg border border-border p-2 hover:bg-accent/50 cursor-pointer transition-colors"
            >
              <div className="size-12 shrink-0 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                {thumb.pageNumber}
              </div>
              <span className="text-sm">{thumb.label}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function SigningViewerPage() {
  const params = useParams();
  const publicId = params.publicId as string;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="truncate font-semibold text-foreground">
            {mockDocument.name}
          </h2>
          <StatusBadge status={mockDocument.status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm">
            <Download className="size-4" />
            Download
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Close">
            <Link href="/">
              <X className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Desktop: 3-pane grid */}
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_280px] lg:h-full">
          <div className="border-r border-border p-4 overflow-hidden">
            <SigningTimeline />
          </div>
          <div className="overflow-hidden">
            <PdfViewer />
          </div>
          <div className="border-l border-border p-4 overflow-hidden">
            <ThumbnailsPanel />
          </div>
        </div>

        {/* Mobile: Tabs */}
        <div className="lg:hidden h-full">
          <Tabs defaultValue="timeline" className="h-full flex flex-col">
            <div className="border-b border-border px-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="document">Document</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="timeline" className="m-0 p-4 h-full">
                <SigningTimeline />
              </TabsContent>
              <TabsContent value="document" className="m-0 p-4 h-full">
                <PdfViewer />
              </TabsContent>
              <TabsContent value="pages" className="m-0 p-4 h-full">
                <ThumbnailsPanel />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
