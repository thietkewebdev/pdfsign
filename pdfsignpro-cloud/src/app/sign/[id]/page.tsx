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
  AlertTriangle,
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
import { getPdfViewerUrl } from "@/lib/pdf-view-url";
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
import { SignaturePlacementFields } from "@/components/signature/SignaturePlacementFields";
import { isWindowsClient, launchSignerWithFallback } from "@/lib/signer-launch";

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
  const [selectedTemplateId, setSelectedTemplateId] = useState("valid");
  const [sealImageBase64, setSealImageBase64] = useState<string | null>(null);

  const {
    placements,
    defaultPlacementEnabled,
    toggleDefaultPlacement,
    addSignatureBox,
    updatePlacement,
    updatePlacementFromPixels,
  } = useSignaturePlacement(totalPages);

  const [placementEditorIdx, setPlacementEditorIdx] = useState(0);
  const safePlacementEditorIdx =
    placements.length === 0
      ? 0
      : Math.min(placementEditorIdx, placements.length - 1);

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

  const goToPdfPage = useCallback((p: number) => {
    setCurrentPage(p);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-pdf-page="${p}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const onPlacementPageChange = useCallback(
    (idx: number, page: number) => {
      updatePlacement(idx, { page });
      goToPdfPage(page);
    },
    [updatePlacement, goToPdfPage]
  );

  const handleSign = async () => {
    if (placements.length === 0 || !docData) return;
    const placement = placements[safePlacementEditorIdx];
    if (!placement) return;

    const jobBody: Record<string, unknown> = {
      documentId: docData.document.id,
      templateId: selectedTemplateId,
      placement: {
        page: placement.page,
        rectPct: {
          x: placement.xPct,
          y: placement.yPct,
          w: placement.wPct,
          h: placement.hPct,
        },
      },
    };
    if (selectedTemplateId === "seal" && sealImageBase64) {
      jobBody.sealImage = sealImageBase64;
    }
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobBody),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(err);
      return;
    }

    const data = await res.json();
    setJobResult({ jobId: data.jobId, deepLink: data.deepLink });
    launchSignerWithFallback({
      deepLink: data.deepLink,
      onFallback: () => setSignerDownloadModalOpen(true),
    });
  };

  const copyDeepLink = () => {
    if (!jobResult) return;
    navigator.clipboard.writeText(jobResult.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activePlacement = placements[safePlacementEditorIdx];
  const activePage = activePlacement?.page ?? currentPage;

  const pdfSource = docData
    ? { pdfUrl: getPdfViewerUrl(docData.presignedUrl, docData.viewUrl) }
    : file
      ? { file }
      : null;

  const fileName = docData?.document.title ?? file?.name ?? "document.pdf";
  const isWindows = isWindowsClient();

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

  const useScrollMode = !!(docData && pdfSource && "pdfUrl" in pdfSource && pdfSource.pdfUrl);

  return (
    <div className="flex h-screen min-h-0 flex-col">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[320px_1fr_280px] lg:min-h-0">
          <div className="flex min-h-0 flex-col overflow-y-auto border-r border-border p-4">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                Signature
              </h3>
              <SignatureTemplateSelector
                templates={SIGNATURE_TEMPLATES}
                selectedId={selectedTemplateId}
                onSelect={(id) => {
                  setSelectedTemplateId(id);
                  if (placements.length === 0 && totalPages > 0) {
                    addSignatureBox(
                      currentPage >= 1 && currentPage <= totalPages
                        ? currentPage
                        : undefined
                    );
                  }
                }}
                sealImageBase64={sealImageBase64}
                onSealImageChange={setSealImageBase64}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  addSignatureBox(
                    currentPage >= 1 && currentPage <= totalPages
                      ? currentPage
                      : undefined
                  )
                }
                className="w-full"
              >
                Add box (current page)
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
              <SignaturePlacementFields
                placements={placements}
                totalPages={totalPages}
                selectedIdx={safePlacementEditorIdx}
                onSelectIdx={setPlacementEditorIdx}
                onPlacementPageChange={onPlacementPageChange}
                lang="en"
              />
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
              {!isWindows && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="size-3.5" />
                    PDFSignPro Signer hiện hỗ trợ Windows.
                  </p>
                  <p className="mt-1">Hãy mở trang này trên máy Windows để ký bằng USB Token.</p>
                </div>
              )}
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
          <div className="flex min-h-0 flex-col overflow-hidden">
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
              sealImageBase64={sealImageBase64}
              continuousScroll={useScrollMode}
            />
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden border-l border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Pages
            </h3>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 pr-2">
                {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const n = i + 1;
                      if (useScrollMode) goToPdfPage(n);
                      else setCurrentPage(n);
                    }}
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

        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <Tabs defaultValue="document" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="signature">Signature</TabsTrigger>
                <TabsTrigger value="document">Document</TabsTrigger>
                <TabsTrigger value="pages">Pages</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <TabsContent value="signature" className="m-0 p-4 h-full">
                <div className="space-y-4">
                  <SignatureTemplateSelector
                    templates={SIGNATURE_TEMPLATES}
                    selectedId={selectedTemplateId}
                    onSelect={(id) => {
                      setSelectedTemplateId(id);
                      if (placements.length === 0 && totalPages > 0) {
                        addSignatureBox(
                          currentPage >= 1 && currentPage <= totalPages
                            ? currentPage
                            : undefined
                        );
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      addSignatureBox(
                        currentPage >= 1 && currentPage <= totalPages
                          ? currentPage
                          : undefined
                      )
                    }
                    className="w-full"
                  >
                    Add box (current page)
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
                  <SignaturePlacementFields
                    placements={placements}
                    totalPages={totalPages}
                    selectedIdx={safePlacementEditorIdx}
                    onSelectIdx={setPlacementEditorIdx}
                    onPlacementPageChange={onPlacementPageChange}
                    lang="en"
                  />
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
              <TabsContent value="document" className="m-0 flex h-full min-h-0 flex-1 flex-col p-0 data-[state=inactive]:hidden">
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
                  sealImageBase64={sealImageBase64}
                  continuousScroll={useScrollMode}
                />
              </TabsContent>
              <TabsContent value="pages" className="m-0 p-4 h-full">
                <div className="space-y-2">
                  {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const n = i + 1;
                        if (useScrollMode) goToPdfPage(n);
                        else setCurrentPage(n);
                      }}
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
            {jobResult?.deepLink && (
              <Button
                variant="outline"
                onClick={() => {
                  launchSignerWithFallback({
                    deepLink: jobResult.deepLink,
                    onFallback: () => setSignerDownloadModalOpen(true),
                  });
                }}
              >
                <ExternalLink className="size-4" />
                Mở Signer lại
              </Button>
            )}
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
