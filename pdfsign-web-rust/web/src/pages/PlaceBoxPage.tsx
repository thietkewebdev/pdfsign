import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, Doc } from "../api";
import { useToast } from "../toast";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type Box = { x: number; y: number; w: number; h: number };

export default function PlaceBoxPage() {
  const { publicId = "" } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [box, setBox] = useState<Box>({ x: 0.64, y: 0.06, w: 0.32, h: 0.1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => {
    api<Doc>(`/documents/${publicId}`)
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [publicId]);

  useEffect(() => {
    if (!doc && !publicId) return;
    let cancelled = false;
    (async () => {
      setLoadingPdf(true);
      const url = doc?.fileUrl || `/api/v1/documents/${publicId}/file`;
      const data = await fetch(url, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Không tải được PDF");
        return r.arrayBuffer();
      });
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (cancelled) return;
      pdfRef.current = pdf;
      setNumPages(pdf.numPages);
      setLoadingPdf(false);

      // thumbnails
      for (let i = 1; i <= pdf.numPages; i++) {
        const canvas = thumbsRef.current[i - 1];
        if (!canvas) continue;
        const pg = await pdf.getPage(i);
        const vp = pg.getViewport({ scale: 0.18 });
        canvas.width = vp.width;
        canvas.height = vp.height;
        await pg.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
    })().catch((e) => {
      if (!cancelled) {
        setError(String(e.message || e));
        setLoadingPdf(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc, publicId]);

  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const p = Math.min(Math.max(page, 1), pdf.numPages);
      const pg = await pdf.getPage(p);
      const viewport = pg.getViewport({ scale: 1.25 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pg.render({ canvasContext: ctx, viewport }).promise;
    })().catch((e) => {
      if (!cancelled) setError(String(e.message || e));
    });
    return () => {
      cancelled = true;
    };
  }, [page, loadingPdf, numPages]);

  function onPointerDown(ev: React.PointerEvent) {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const startX = (ev.clientX - r.left) / r.width;
    const startY = (ev.clientY - r.top) / r.height;
    const moving = (e: PointerEvent) => {
      const x1 = Math.min(startX, (e.clientX - r.left) / r.width);
      const x2 = Math.max(startX, (e.clientX - r.left) / r.width);
      const y1 = Math.min(startY, (e.clientY - r.top) / r.height);
      const y2 = Math.max(startY, (e.clientY - r.top) / r.height);
      setBox({
        x: Math.min(Math.max(x1, 0), 1),
        w: Math.min(Math.max(x2 - x1, 0.04), 1),
        h: Math.min(Math.max(y2 - y1, 0.02), 1),
        y: Math.min(Math.max(1 - y2, 0), 1),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", moving);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", moving);
    window.addEventListener("pointerup", up);
  }

  async function createJob() {
    if (!doc) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ jobId: string; deepLink: string }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          documentId: doc.id,
          templateId: "valid",
          placement: { page, rectPct: box },
        }),
      });
      toast.push("Đã tạo phiên ký", "ok");
      nav(`/jobs/${res.jobId}`, { state: res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi tạo job";
      setError(msg);
      toast.push(msg, "err");
    } finally {
      setBusy(false);
    }
  }

  const top = (1 - box.y - box.h) * 100;

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">{doc?.title || publicId}</h1>
      </div>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="viewer-layout">
        <div className="card card-pad">
          <div className="field">
            <label>Trang</label>
            <input
              type="number"
              min={1}
              max={numPages}
              value={page}
              onChange={(e) => setPage(Number(e.target.value) || 1)}
            />
          </div>
          <div className="thumbs" aria-label="Trang PDF">
            {Array.from({ length: numPages }, (_, i) => (
              <button
                key={i}
                type="button"
                className={page === i + 1 ? "active" : ""}
                onClick={() => setPage(i + 1)}
                aria-label={`Trang ${i + 1}`}
                aria-pressed={page === i + 1}
              >
                <canvas
                  ref={(el) => {
                    thumbsRef.current[i] = el;
                  }}
                />
                <span className="tiny">{i + 1}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy || !doc} onClick={createJob}>
            {busy ? "…" : "Tạo phiên ký"}
          </button>
        </div>

        <div className="viewer-canvas-wrap">
          {loadingPdf ? (
            <div className="skeleton" style={{ width: 420, height: 560 }} />
          ) : (
            <div className="page-stage" ref={stageRef} onPointerDown={onPointerDown}>
              <canvas ref={canvasRef} />
              <div
                className="sig-box"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${top}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                }}
              >
                <span className="tag">Chữ ký</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
