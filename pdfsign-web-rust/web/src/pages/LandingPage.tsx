import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, User } from "../api";
import { PRICING } from "../pricing";
import ProductMock from "../components/ProductMock";
import AuthGateModal from "../components/AuthGateModal";
import { useToast } from "../toast";

type Phase = "idle" | "uploading" | "ready" | "signing" | "done";

export default function LandingPage({
  user,
  onAuth,
}: {
  user: User | null;
  onAuth: (u: User) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [publicId, setPublicId] = useState("");
  const [title, setTitle] = useState("");
  const [docId, setDocId] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [jobId, setJobId] = useState("");
  const [download, setDownload] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const nav = useNavigate();

  async function uploadFile(file: File) {
    setError("");
    setPhase("uploading");
    setDownload(null);
    setDeepLink("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      const res = await api<{
        publicId: string;
        documentId: string;
        title: string;
      }>("/documents", { method: "POST", body: fd });
      setPublicId(res.publicId);
      setDocId(res.documentId);
      setTitle(res.title || file.name);
      setPhase("ready");
      toast.push("Đã tải lên", "ok");
    } catch (e) {
      setPhase("idle");
      if (e instanceof ApiError && e.code === "GUEST_LIMIT_REACHED") {
        setPendingFile(file);
        setGateOpen(true);
        setError(e.message);
        return;
      }
      const msg = e instanceof Error ? e.message : "Lỗi";
      setError(msg);
      toast.push(msg, "err");
    }
  }

  async function startSign() {
    if (!docId && !publicId) return;
    setPhase("signing");
    setError("");
    try {
      const res = await api<{ jobId: string; deepLink: string }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          documentId: docId || publicId,
          templateId: "valid",
          placement: { page: 1, rectPct: { x: 0.64, y: 0.06, w: 0.32, h: 0.1 } },
        }),
      });
      setJobId(res.jobId);
      setDeepLink(res.deepLink);
      toast.push("Đã tạo phiên ký", "ok");
      void poll(res.jobId);
    } catch (e) {
      setPhase("ready");
      if (e instanceof ApiError && e.code === "GUEST_LIMIT_REACHED") {
        setGateOpen(true);
        setError(e.message);
        return;
      }
      const msg = e instanceof Error ? e.message : "Lỗi";
      setError(msg);
      toast.push(msg, "err");
    }
  }

  async function poll(id: string) {
    try {
      const s = await api<{ status: string; signedDownloadUrl?: string | null }>(
        `/jobs/${id}/status`,
      );
      if (s.signedDownloadUrl) {
        setDownload(s.signedDownloadUrl);
        setPhase("done");
        toast.push("Đã ký xong", "ok");
        return;
      }
      if (s.status === "READY" || s.status === "CREATED" || s.status === "IN_PROGRESS") {
        setTimeout(() => void poll(id), 2000);
      }
    } catch {
      setTimeout(() => void poll(id), 2500);
    }
  }

  async function onAuthed(u: User) {
    onAuth(u);
    setGateOpen(false);
    if (pendingFile) {
      const f = pendingFile;
      setPendingFile(null);
      await uploadFile(f);
    }
  }

  return (
    <>
      <section className="home-hero">
        <div className="home-hero-copy">
          <h1>
            Ký PDF
            <br />
            bằng USB token
          </h1>
          <p className="lead">Khóa riêng không rời máy. PAdES trên máy local.</p>
          <div className="home-hero-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => inputRef.current?.click()}>
              Tải PDF lên
            </button>
            {!user && (
              <Link className="btn btn-ghost btn-lg" to="/register">
                Đăng ký
              </Link>
            )}
            {user && (
              <Link className="btn btn-ghost btn-lg" to="/dashboard">
                Bảng điều khiển
              </Link>
            )}
          </div>
          <div
            className={`home-drop ${drag ? "drag" : ""} ${phase !== "idle" ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void uploadFile(f);
            }}
          >
            {phase === "idle" && (
              <>
                <strong>Kéo PDF vào đây</strong>
                <span className="muted">2 file miễn phí khi chưa đăng nhập</span>
              </>
            )}
            {phase === "uploading" && <strong>Đang tải…</strong>}
            {phase === "ready" && (
              <>
                <strong>{title || publicId}</strong>
                <div className="toolbar" style={{ marginBottom: 0, justifyContent: "center" }}>
                  <button type="button" className="btn btn-primary" onClick={() => void startSign()}>
                    Ký ngay
                  </button>
                  <Link className="btn btn-ghost" to={`/d/${publicId}`}>
                    Đặt ô chữ ký
                  </Link>
                </div>
              </>
            )}
            {phase === "signing" && (
              <>
                <strong>Phiên ký sẵn sàng</strong>
                {deepLink && (
                  <div className="toolbar" style={{ marginBottom: 0, justifyContent: "center" }}>
                    <a className="btn btn-primary" href={deepLink}>
                      Mở app ký
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        void navigator.clipboard.writeText(deepLink);
                        toast.push("Đã sao chép", "ok");
                      }}
                    >
                      Sao chép link
                    </button>
                  </div>
                )}
                <div className="tiny">{jobId}</div>
              </>
            )}
            {phase === "done" && (
              <>
                <strong>Đã ký xong</strong>
                {download && (
                  <a className="btn btn-primary" href={download}>
                    Tải PDF đã ký
                  </a>
                )}
              </>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
        </div>
        <div className="home-hero-visual">
          <ProductMock />
        </div>
      </section>

      <section className="home-trust">
        <div className="home-trust-inner">
          <span>PAdES B-B · B-T · B-LT · B-LTA</span>
          <span>USB token Viettel · VNPT · BKAV</span>
          <span>Khóa riêng không rời máy</span>
        </div>
      </section>

      <section className="home-section" id="cach-lam">
        <div className="home-section-head">
          <h2>Cách làm</h2>
        </div>
        <ol className="home-steps">
          <li>
            <div className="home-step-visual step-upload" />
            <strong>Tải PDF</strong>
          </li>
          <li>
            <div className="home-step-visual step-box" />
            <strong>Đặt ô chữ ký</strong>
          </li>
          <li>
            <div className="home-step-visual step-token" />
            <strong>Mở app ký</strong>
          </li>
          <li>
            <div className="home-step-visual step-done" />
            <strong>Tải file đã ký</strong>
          </li>
        </ol>
      </section>

      <section className="home-section home-alt" id="tinh-nang">
        <div className="home-feature-row">
          <div>
            <h2>Ký trên máy local</h2>
            <p className="lead">USB token giữ khóa. Server chỉ nhận file đã ký.</p>
          </div>
          <div className="home-feature-panel">
            <div className="home-feature-chip">SoftHSM · PKCS#11</div>
            <div className="home-feature-chip">pdfsign://v1</div>
            <div className="home-feature-chip">Idempotent complete</div>
          </div>
        </div>
        <div className="home-feature-row reverse">
          <div>
            <h2>Đặt vị trí chính xác</h2>
            <p className="lead">Chọn trang, kéo khung chữ ký, xem trước stamp.</p>
          </div>
          <div className="home-feature-panel place-mini">
            <div className="mini-page">
              <div className="mini-sig" />
            </div>
          </div>
        </div>
        <div className="home-feature-row">
          <div>
            <h2>Xác minh nhanh</h2>
            <p className="lead">Digest, chữ ký, ByteRange, LTV trên một trang.</p>
          </div>
          <div className="home-feature-panel">
            <div className="verify-pill ok">Hợp lệ</div>
            <div className="verify-pill bad">Không hợp lệ</div>
          </div>
        </div>
      </section>

      <section className="home-section home-download" id="tai-app">
        <div className="home-download-inner">
          <div>
            <h2>App ký Windows</h2>
            <p className="lead">Cài PDFSign, cắm USB token, nhận job từ web.</p>
            <div className="toolbar">
              <a className="btn btn-primary btn-lg" href="/#tai-app">
                Tải bản Windows
              </a>
              <Link className="btn btn-ghost btn-lg" to="/verify">
                Xác minh PDF
              </Link>
            </div>
          </div>
          <div className="home-download-visual">
            <div className="dl-window">
              <div className="dl-title">PDFSign 0.2.1</div>
              <div className="dl-row">Token sẵn sàng</div>
              <div className="dl-row accent">Chờ job từ web…</div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section" id="bang-gia">
        <div className="home-section-head">
          <h2>Bảng giá</h2>
        </div>
        <div className="home-price-grid">
          {PRICING.map((p) => (
            <div key={p.id} className={`home-price ${p.featured ? "featured" : ""}`}>
              <div className="h3">{p.name}</div>
              <div className="amt">
                {p.price}
                {p.period && <span className="muted">{p.period}</span>}
              </div>
              <p className="muted">{p.blurb}</p>
              {p.id === "enterprise" ? (
                <a className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }} href="mailto:info@pdfsign.vn">
                  {p.cta}
                </a>
              ) : (
                <Link
                  className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`}
                  style={{ width: "100%", marginTop: 12 }}
                  to="/register"
                >

                  {p.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="home-section faq" id="faq">
        <div className="home-section-head">
          <h2>Câu hỏi thường gặp</h2>
        </div>
        <details open>
          <summary>Chữ ký USB token có hợp pháp không?</summary>
          <p className="muted">Có, theo Luật Giao dịch điện tử.</p>
        </details>
        <details>
          <summary>Khóa riêng có lên server không?</summary>
          <p className="muted">Không. Ký trên máy có USB token.</p>
        </details>
        <details>
          <summary>Khách được ký bao nhiêu file?</summary>
          <p className="muted">2 file miễn phí, sau đó cần đăng ký.</p>
        </details>
        <details>
          <summary>Làm sao kiểm tra file đã ký?</summary>
          <p className="muted">Dùng trang Xác minh hoặc Adobe Acrobat.</p>
        </details>
      </section>

      <AuthGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onAuth={onAuthed}
        resumeHint="Đã dùng hết 2 file miễn phí. Đăng nhập để tiếp tục file này."
      />
    </>
  );
}
