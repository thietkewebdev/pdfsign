import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, ApiError, Doc } from "../api";
import { WINDOWS_INSTALLER_URL } from "../homeContent";
import { useToast } from "../toast";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type Box = { x: number; y: number; w: number; h: number };
type Phase = "edit" | "waiting" | "done";

const DEFAULT_BOX: Box = { x: 0.64, y: 0.06, w: 0.32, h: 0.1 };
const APP_HINT_MS = 10_000;

export default function PlaceBoxPage() {
  const { publicId = "" } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [box, setBox] = useState<Box>(DEFAULT_BOX);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [phase, setPhase] = useState<Phase>("edit");
  const [download, setDownload] = useState<string | null>(null);
  const [showAppHint, setShowAppHint] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const pollStop = useRef(false);
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
      setPage(pdf.numPages); // default: last page
      setLoadingPdf(false);

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

  useEffect(() => () => {
    pollStop.current = true;
  }, []);

  function onPointerDown(ev: React.PointerEvent) {
    if (phase !== "edit") return;
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const startX = (ev.clientX - r.left) / r.width;
    const startY = (ev.clientY - r.top) / r.height;
    let moved = false;
    const moving = (e: PointerEvent) => {
      const curX = (e.clientX - r.left) / r.width;
      const curY = (e.clientY - r.top) / r.height;
      if (Math.abs(curX - startX) > 0.01 || Math.abs(curY - startY) > 0.01) moved = true;
      const x1 = Math.min(startX, curX);
      const x2 = Math.max(startX, curX);
      const y1 = Math.min(startY, curY);
      const y2 = Math.max(startY, curY);
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
      if (!moved) {
        // Click: place default-sized box centered on click (PDF bottom-left origin).
        const w = DEFAULT_BOX.w;
        const h = DEFAULT_BOX.h;
        const x = Math.min(Math.max(startX - w / 2, 0), 1 - w);
        const topY = Math.min(Math.max(startY - h / 2, 0), 1 - h);
        setBox({ x, y: 1 - topY - h, w, h });
      }
    };
    window.addEventListener("pointermove", moving);
    window.addEventListener("pointerup", up);
  }

  async function pollJob(jobId: string) {
    if (pollStop.current) return;
    try {
      const s = await api<{ status: string; signedDownloadUrl?: string | null }>(
        `/jobs/${jobId}/status`,
      );
      if (s.signedDownloadUrl) {
        setDownload(s.signedDownloadUrl);
        setPhase("done");
        setShowAppHint(false);
        toast.push("Đã ký", "ok");
        return;
      }
      if (["READY", "CREATED", "IN_PROGRESS"].includes(s.status)) {
        setTimeout(() => void pollJob(jobId), 2000);
      }
    } catch {
      setTimeout(() => void pollJob(jobId), 2500);
    }
  }

  async function sign() {
    if (!doc) return;
    setBusy(true);
    setError("");
    setShowAppHint(false);
    try {
      const res = await api<{ jobId: string; deepLink: string }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          documentId: doc.id,
          templateId: "valid",
          placement: { page, rectPct: box },
        }),
      });
      setPhase("waiting");
      // Launch desktop via custom protocol.
      window.location.href = res.deepLink;
      window.setTimeout(() => {
        if (!pollStop.current) setShowAppHint(true);
      }, APP_HINT_MS);
      void pollJob(res.jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi";
      setError(msg);
      toast.push(msg, "err");
      if (e instanceof ApiError && e.code === "GUEST_LIMIT_REACHED") {
        window.location.href = "/register";
      }
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
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {phase === "done" && download ? (
        <div className="card card-pad" style={{ maxWidth: 480 }}>
          <strong>Đã ký</strong>
          <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
            <a className="btn btn-primary" href={download}>
              Tải PDF
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPhase("edit");
                setDownload(null);
                setShowAppHint(false);
              }}
            >
              Ký lại
            </button>
          </div>
        </div>
      ) : (
        <div className="viewer-layout viewer-layout-sign">
          <div className="card card-pad place-sidebar">
            <div className="field">
              <label>Trang</label>
              <input
                type="number"
                min={1}
                max={numPages}
                value={page}
                disabled={phase !== "edit"}
                onChange={(e) => setPage(Number(e.target.value) || 1)}
              />
            </div>
            <div className="thumbs" aria-label="Trang">
              {Array.from({ length: numPages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={page === i + 1 ? "active" : ""}
                  disabled={phase !== "edit"}
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
          </div>

          <div className="viewer-canvas-wrap">
            {loadingPdf ? (
              <div className="skeleton" style={{ width: 420, height: 560 }} />
            ) : (
              <div
                className="page-stage"
                ref={stageRef}
                onPointerDown={onPointerDown}
                style={{ cursor: phase === "edit" ? "crosshair" : "default" }}
              >
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
      )}

      {phase !== "done" && (
        <div className="sign-sticky-bar" role="region" aria-label="Ký">
          <button
            className="btn btn-primary"
            disabled={busy || !doc || phase === "waiting"}
            onClick={() => void sign()}
          >
            {phase === "waiting" ? "Đang ký…" : busy ? "…" : "Ký"}
          </button>
          {phase === "waiting" && showAppHint && (
            <a className="btn btn-ghost" href={WINDOWS_INSTALLER_URL}>
              Tải app ký
            </a>
          )}
          {phase === "waiting" && (
            <div className="skeleton" style={{ height: 6, flex: 1, maxWidth: 200 }} />
          )}
        </div>
      )}
    </div>
  );
}
