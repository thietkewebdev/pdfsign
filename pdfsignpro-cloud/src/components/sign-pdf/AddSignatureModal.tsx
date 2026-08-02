"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fileToPngDataUrl, renderTypedSignature } from "@/lib/visual-sign";

const COLORS = [
  { id: "black", value: "#0f172a", label: "Đen" },
  { id: "blue", value: "#1d4ed8", label: "Xanh" },
  { id: "navy", value: "#003b93", label: "Navy" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (signatureDataUrl: string) => void;
};

export function AddSignatureModal({ open, onOpenChange, onDone }: Props) {
  const [tab, setTab] = useState<"draw" | "image" | "type">("draw");
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [typedName, setTypedName] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab("draw");
    setImagePreview(null);
    setHasInk(false);
    setBusy(false);
    // Reset draw surface after dialog mounts
    const t = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.5;
      setHasInk(false);
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointerPos(e);
    ctx.strokeStyle = color;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const canSubmit =
    (tab === "draw" && hasInk) ||
    (tab === "image" && !!imagePreview) ||
    (tab === "type" && typedName.trim().length > 0);

  const handleDone = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      let dataUrl: string;
      if (tab === "draw") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        dataUrl = canvas.toDataURL("image/png");
      } else if (tab === "image") {
        if (!imagePreview) return;
        dataUrl = imagePreview;
      } else {
        dataUrl = await renderTypedSignature(typedName, color);
      }
      onDone(dataUrl);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const url = await fileToPngDataUrl(file);
    setImagePreview(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-lg font-bold tracking-tight">
            Thêm chữ ký
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-3">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as typeof tab)}
            className="w-full"
          >
            <div className="flex items-center justify-between gap-3">
              <TabsList className="h-9">
                <TabsTrigger value="draw">Vẽ</TabsTrigger>
                <TabsTrigger value="image">Ảnh</TabsTrigger>
                <TabsTrigger value="type">Gõ</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2" aria-label="Màu chữ ký">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "size-6 rounded-full border-2 transition-transform",
                      color === c.value
                        ? "scale-110 border-primary"
                        : "border-transparent opacity-80 hover:opacity-100"
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>

            <TabsContent value="draw" className="mt-4 focus-visible:outline-none">
              <div className="relative overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
                <canvas
                  ref={canvasRef}
                  className="h-52 w-full touch-none cursor-crosshair sm:h-60"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
                {!hasInk && (
                  <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-slate-400">
                    Ký tại đây
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearCanvas}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-primary"
              >
                <Eraser className="size-3.5" />
                Xóa chữ ký
              </button>
            </TabsContent>

            <TabsContent value="image" className="mt-4 focus-visible:outline-none">
              <label className="flex h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 transition-colors hover:bg-slate-100 sm:h-60">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt="Chữ ký tải lên"
                    className="max-h-44 max-w-[90%] object-contain"
                  />
                ) : (
                  <>
                    <Upload className="size-8 text-slate-400" />
                    <span className="text-sm text-slate-500">
                      Tải ảnh chữ ký (PNG, JPG)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
              </label>
            </TabsContent>

            <TabsContent value="type" className="mt-4 space-y-3 focus-visible:outline-none">
              <div className="space-y-2">
                <Label htmlFor="typed-name">Họ và tên</Label>
                <Input
                  id="typed-name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="h-11"
                />
              </div>
              <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4">
                <p
                  className="truncate text-center text-4xl sm:text-5xl"
                  style={{
                    fontFamily: 'var(--font-signature), "Great Vibes", cursive',
                    color,
                  }}
                >
                  {typedName.trim() || "Chữ ký của bạn"}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleDone} disabled={!canSubmit || busy}>
            {busy ? "Đang tạo…" : "Xong"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
