"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, X, ZoomIn, ZoomOut, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PdfViewer } from "@/components/pdf/PdfViewer";

interface DocumentData {
  document: {
    id: string;
    publicId: string;
    title: string;
    status: string;
    createdAt: string;
  };
  currentVersion: {
    version: number;
    sizeBytes: number;
    createdAt: string;
  };
  presignedUrl: string;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "SIGNED"
      ? "success"
      : status === "ACTIVE"
        ? "warning"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

export default function SigningViewerPage() {
  const params = useParams();
  const router = useRouter();
  const publicId = params.publicId as string;
  const [data, setData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (!publicId) return;
    fetch(`/api/documents/${publicId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Document not found");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [publicId]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">{error ?? "Document not found"}</p>
        <Button asChild>
          <Link href="/">Upload PDF</Link>
        </Button>
      </div>
    );
  }

  const { document: doc, currentVersion, presignedUrl } = data;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="truncate font-semibold text-foreground">
            {doc.title}
          </h2>
          <StatusBadge status={doc.status} />
          <span className="text-xs text-muted-foreground">
            v{currentVersion.version}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <a href={presignedUrl} download={doc.title}>
              <Download className="size-4" />
              Download
            </a>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => router.push(`/sign/${publicId}`)}
          >
            <PenLine className="size-4" />
            Ký số
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Close">
            <Link href="/">
              <X className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_280px] lg:h-full">
          <div className="border-r border-border p-4 overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Signing timeline
            </h3>
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <div className="space-y-2 pr-4 text-sm text-muted-foreground">
                <p>Document uploaded</p>
                <p className="text-xs">
                  {new Date(doc.createdAt).toLocaleString()}
                </p>
                <Separator className="my-2" />
                <p>Ready for signature</p>
              </div>
            </ScrollArea>
          </div>
          <div className="overflow-hidden">
            <PdfViewer
              pdfUrl={presignedUrl}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              scale={scale}
              onScaleChange={setScale}
              totalPages={totalPages}
              onTotalPagesChange={setTotalPages}
              placements={[]}
              onPlacementUpdate={() => {}}
              activePageForPlacement={currentPage}
            />
          </div>
          <div className="border-l border-border p-4 overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Pages
            </h3>
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <div className="space-y-2 pr-2">
                {Array.from(
                  { length: Math.max(totalPages, 1) },
                  (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentPage(i + 1)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                        currentPage === i + 1
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <div className="size-12 shrink-0 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        {i + 1}
                      </div>
                      <span className="text-sm">Page {i + 1}</span>
                    </button>
                  )
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="lg:hidden h-full">
          <Tabs defaultValue="document" className="h-full flex flex-col">
            <div className="border-b border-border px-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="document">Document</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="timeline" className="m-0 p-4 h-full">
                <p className="text-sm text-muted-foreground">
                  Document uploaded • Ready for signature
                </p>
              </TabsContent>
              <TabsContent value="document" className="m-0 p-0 h-full">
                <PdfViewer
                  pdfUrl={presignedUrl}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  scale={scale}
                  onScaleChange={setScale}
                  totalPages={totalPages}
                  onTotalPagesChange={setTotalPages}
                  placements={[]}
                  onPlacementUpdate={() => {}}
                  activePageForPlacement={currentPage}
                />
              </TabsContent>
              <TabsContent value="pages" className="m-0 p-4 h-full">
                <div className="space-y-2">
                  {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentPage(i + 1)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left ${
                        currentPage === i + 1
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      }`}
                    >
                      <div className="size-12 shrink-0 rounded bg-muted flex items-center justify-center text-xs">
                        {i + 1}
                      </div>
                      <span className="text-sm">Page {i + 1}</span>
                    </button>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <div className="border-t border-border p-4">
            <Button
              className="w-full"
              onClick={() => router.push(`/sign/${publicId}`)}
            >
              <PenLine className="size-4" />
              Ký số
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
