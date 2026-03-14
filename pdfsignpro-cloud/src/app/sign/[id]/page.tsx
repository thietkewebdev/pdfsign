"use client";

import { useParams } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Download,
  HelpCircle,
  Copy,
  Check,
  ExternalLink,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { useUpload } from "@/contexts/upload-context";
import { useSignaturePlacement } from "@/hooks/use-signature-placement";
import type { SignaturePlacement } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SIGNATURE_TEMPLATES } from "@/lib/signature-templates";
import { SignatureTemplateSelector } from "@/components/signature/SignatureTemplateSelector";

interface DocumentData {
  document: { id: string; publicId: string; title: string };
  currentVersion: { version: number };
  presignedUrl: string;
  viewUrl?: string;
}

export default function SignPage() {
  const params = useParams();
  const publicId = params.id as string;
  const { theme, setTheme } = useTheme();
  const { file } = useUpload();

  const [docData, setDocData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [jobResult, setJobResult] = useState<{
    jobId: string;
    deepLink: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [signerDownloadModalOpen, setSignerDownloadModalOpen] = useState(false);
  const userLeftTabRef = useRef(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("classic");

  const {
    placements,
    defaultPlacementEnabled,
    toggleDefaultPlacement,
    addSignatureBox,
    updatePlacementFromPixels,
  } = useSignaturePlacement(totalPages);

  useEffect(() => {
    if (!publicId) {
      setLoading(false);
      return;
    }
    fetch(`/api/documents/${publicId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Document not found");
        return res.json();
      })
      .then(setDocData)
      .catch(() => setDocData(null))
      .finally(() => setLoading(false));
  }, [publicId]);

  const handleTotalPagesChange = useCallback((n: number) => {
    setTotalPages(n);
  }, []);

  const handlePlacementUpdate = useCallback(
    (
      index: number,
      pageWidth: number,
      pageHeight: number,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      updatePlacementFromPixels(index, pageWidth, pageHeight, x, y, w, h);
    },
    [updatePlacementFromPixels]
  );

  const handleSign = async () => {
    if (placements.length === 0 || !docData) return;
    const placement = placements[0];

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: docData.document.id,
        placement: {
          page: placement.page,
          rectPct: {
            x: placement.xPct,
            y: placement.yPct,
            w: placement.wPct,
            h: placement.hPct,
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(err);
      return;
    }

    const data = await res.json();
    setJobResult({ jobId: data.jobId, deepLink: data.deepLink });
    userLeftTabRef.current = false;
    window.location.href = data.deepLink;
    setTimeout(() => {
      if (!userLeftTabRef.current) setSignerDownloadModalOpen(true);
    }, 2500);
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) userLeftTabRef.current = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const copyDeepLink = () => {
    if (!jobResult) return;
    navigator.clipboard.writeText(jobResult.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activePlacement = placements[0];
  const activePage = activePlacement?.page ?? currentPage;

  const pdfSource = docData
    ? { pdfUrl: docData.viewUrl ?? docData.presignedUrl }
    : file
      ? { file }
      : null;

  const fileName = docData?.document.title ?? file?.name ?? "document.pdf";

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!docData && !file) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">
          Chưa có file PDF. Vui lòng upload file trước.
        </p>
        <Button asChild>
          <Link href="/">Upload PDF</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="font-semibold text-foreground hover:text-foreground/90 shrink-0"
          >
            PDFSignPro Cloud
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-foreground">{fileName}</span>
          <Badge variant="secondary">Draft</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="size-4 hidden dark:block" />
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Download className="size-4" />
            Download
          </Button>
          <Button variant="ghost" size="sm">
            <HelpCircle className="size-4" />
            Help
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_280px]">
          <div className="border-r border-border p-4 overflow-hidden flex flex-col">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                Signature
              </h3>
              <SignatureTemplateSelector
                templates={SIGNATURE_TEMPLATES}
                selectedId={selectedTemplateId}
                onSelect={(id) => {
                  setSelectedTemplateId(id);
                  if (placements.length === 0 && totalPages > 0) addSignatureBox();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addSignatureBox}
                className="w-full"
              >
                Add signature box
              </Button>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="default-placement">Default placement</Label>
                <button
                  id="default-placement"
                  type="button"
                  role="switch"
                  aria-checked={defaultPlacementEnabled}
                  onClick={toggleDefaultPlacement}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors ${
                    defaultPlacementEnabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`${
                      defaultPlacementEnabled ? "translate-x-4" : "translate-x-1"
                    } inline-block size-3.5 rounded-full bg-background transition-transform`}
                  />
                </button>
              </div>
              {activePlacement && (
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <p>Page: {activePlacement.page}</p>
                  <p>
                    Box: {Math.round(activePlacement.wPct * 100)}% ×{" "}
                    {Math.round(activePlacement.hPct * 100)}%
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Appearance preview</p>
                <p>Ký bởi: &lt;Tên công ty từ chứng thư&gt;</p>
                <p>Ngày ký: &lt;timestamp&gt;</p>
                <p className="pt-2 text-muted-foreground/80">
                  Certificate will be selected in PDFSignPro Desktop
                </p>
              </div>
              <Button
                onClick={handleSign}
                disabled={placements.length === 0}
                className="w-full"
              >
                Ký số
              </Button>
              {jobResult && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground">
                    Deep link created
                  </p>
                  <p className="break-all text-xs text-muted-foreground font-mono">
                    {jobResult.deepLink}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyDeepLink}
                      className="flex-1"
                    >
                      {copied ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" asChild className="flex-1">
                      <a href={jobResult.deepLink}>
                        <ExternalLink className="size-4" />
                        Open PDFSignPro Desktop
                      </a>
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignerDownloadModalOpen(true)}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Chưa mở được? Tải ứng dụng
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="overflow-hidden">
            <PdfViewer
              {...pdfSource}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              scale={scale}
              onScaleChange={setScale}
              totalPages={totalPages}
              onTotalPagesChange={handleTotalPagesChange}
              placements={placements}
              onPlacementUpdate={handlePlacementUpdate}
              activePageForPlacement={activePage}
              selectedTemplateId={selectedTemplateId}
            />
          </div>
          <div className="border-l border-border p-4 overflow-hidden">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Pages
            </h3>
            <ScrollArea className="h-[calc(100vh-12rem)]">
              <div className="space-y-2 pr-2">
                {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
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
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="lg:hidden h-full">
          <Tabs defaultValue="document" className="h-full flex flex-col">
            <div className="border-b border-border px-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="signature">Signature</TabsTrigger>
                <TabsTrigger value="document">Document</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-auto">
              <TabsContent value="signature" className="m-0 p-4 h-full">
                <div className="space-y-4">
                  <SignatureTemplateSelector
                    templates={SIGNATURE_TEMPLATES}
                    selectedId={selectedTemplateId}
                    onSelect={(id) => {
                      setSelectedTemplateId(id);
                      if (placements.length === 0 && totalPages > 0) addSignatureBox();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addSignatureBox}
                    className="w-full"
                  >
                    Add signature box
                  </Button>
                  <div className="flex items-center justify-between gap-2">
                    <Label>Default placement</Label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={defaultPlacementEnabled}
                      onClick={toggleDefaultPlacement}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors ${
                        defaultPlacementEnabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`${
                          defaultPlacementEnabled
                            ? "translate-x-4"
                            : "translate-x-1"
                        } inline-block size-3.5 rounded-full bg-background transition-transform`}
                      />
                    </button>
                  </div>
                  <Button
                    onClick={handleSign}
                    disabled={placements.length === 0}
                    className="w-full"
                  >
                    Ký số
                  </Button>
                  {jobResult && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="break-all text-xs font-mono">
                        {jobResult.deepLink}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyDeepLink}
                        >
                          {copied ? "Copied" : "Copy"}
                        </Button>
                        <Button size="sm" asChild>
                          <a href={jobResult.deepLink}>
                            Open PDFSignPro Desktop
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="document" className="m-0 p-0 h-full">
                <div className="h-full">
                  <PdfViewer
                    {...pdfSource}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    scale={scale}
                    onScaleChange={setScale}
                    totalPages={totalPages}
                    onTotalPagesChange={handleTotalPagesChange}
                    placements={placements}
                    onPlacementUpdate={handlePlacementUpdate}
                    activePageForPlacement={activePage}
                    selectedTemplateId={selectedTemplateId}
                  />
                </div>
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
        </div>
      </div>

      <Dialog open={signerDownloadModalOpen} onOpenChange={setSignerDownloadModalOpen}>
        <DialogContent className="sm:max-w-md shadow-xl ring-1 ring-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Download className="size-5 text-primary" />
              Chưa mở được ứng dụng ký số?
            </DialogTitle>
            <DialogDescription className="text-base pt-1">
              Có thể máy tính chưa cài PDFSignPro Signer. Tải và cài đặt ứng dụng (Windows) để ký số PDF bằng USB Token.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              variant="outline"
              onClick={() => setSignerDownloadModalOpen(false)}
            >
              Đóng
            </Button>
            <Button
              onClick={() => {
                window.open("/api/signer/download", "_blank");
                setSignerDownloadModalOpen(false);
              }}
            >
              <Download className="size-4" />
              Tải PDFSignPro Signer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
