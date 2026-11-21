import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, User } from "../api";
import {
  HOME,
  HOME_FACTS,
  WINDOWS_INSTALLER_URL,
  WINDOWS_INSTALL_GUIDE_URL,
} from "../homeContent";
import AuthGateModal from "../components/AuthGateModal";
import { useToast } from "../toast";
import "../home.css";

type Phase = "idle" | "uploading" | "ready" | "signing" | "done";

function ContractMock() {
  return (
    <div className="contract-stage">
      <div className="contract-window">
        <div className="contract-chrome">
          <span className="contract-dot" />
          <span className="contract-dot" />
          <span className="contract-dot" />
          <span>pdfsign.vn/ky/hop-dong-mua-ban.pdf</span>
        </div>
        <div className="contract-page">
          <h3>HỢP ĐỒNG MUA BÁN</h3>
          <div className="contract-line" />
          <div className="contract-line short" />
          <div className="contract-line" />
          <div className="contract-line short" />
          <div className="contract-line" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, fontSize: 11, color: "#94a3b8" }}>
            <span>ĐẠI DIỆN BÊN A</span>
            <span>ĐẠI DIỆN BÊN B</span>
          </div>
          <div className="contract-sig">
            <div className="ok">Đã ký số</div>
            <div className="meta">
              Ký bởi: CÔNG TY TNHH ABC
              <br />
              Ngày ký: 21/11/2026 09:42
            </div>
          </div>
        </div>
        <div className="contract-side">
          <div className="lbl">Chữ ký số</div>
          <div className="box">USB token</div>
          <div className="box">Viettel-CA · Nguyễn Văn A</div>
          <div className="box">
            <span className="dot-ok" />
            Chứng thư · Còn hạn đến 03/2028
          </div>
          <label className="contract-check">
            <input type="checkbox" defaultChecked readOnly /> Thêm dấu thời gian
          </label>
          <div className="lbl">Trang 3 · góc phải dưới</div>
          <div className="btn-sign">Ký số</div>
        </div>
      </div>
      <div className="success-toast">
        <div className="ico">✓</div>
        <div>
          <strong>Ký thành công</strong>
          <span>hop-dong-mua-ban.pdf · chữ ký hợp lệ</span>
        </div>
      </div>
    </div>
  );
}

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
  const facts = HOME_FACTS;

  function openUpload() {
    inputRef.current?.click();
  }

  async function uploadFile(file: File) {
    setError("");
    setPhase("uploading");
    setDownload(null);
    setDeepLink("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      const res = await api<{ publicId: string; documentId: string; title: string }>(
        "/documents",
        { method: "POST", body: fd },
      );
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
      if (["READY", "CREATED", "IN_PROGRESS"].includes(s.status)) {
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

  const showStats = !!(facts.statsSignedFiles || facts.statsCompanies);
  const showTestimonial = !!facts.testimonial;
  const showSocial = showStats || showTestimonial;

  const securityItems = HOME.security.items.filter((item) => {
    if ("always" in item && item.always) return true;
    if ("fact" in item && item.fact === "fileRetentionDays") return facts.fileRetentionDays != null;
    if ("fact" in item && item.fact === "dataLocation") return !!facts.dataLocation;
    return false;
  });

  const windowsMeta = [
    "Windows 10/11",
    "64-bit",
    facts.windowsAppSizeMb != null ? `${facts.windowsAppSizeMb} MB` : null,
    "Miễn phí",
  ]
    .filter(Boolean)
    .join(" · ");

  const faqLead = facts.hotline
    ? `Chưa thấy câu trả lời? Gọi ${facts.hotline} hoặc nhắn Zalo, chúng tôi trả lời trong giờ hành chính.`
    : HOME.faq.leadMissingHotline;

  return (
    <div className="home-page">
      <section className="ref-hero">
        <div className="home-wrap ref-hero-grid">
          <div>
            <div className="ref-badge">{HOME.hero.badge}</div>
            <h1>{HOME.hero.title}</h1>
            <p className="home-lead">{HOME.hero.lead}</p>
            <div className="ref-hero-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={openUpload}>
                {HOME.hero.primaryCta}
              </button>
              <a className="btn btn-ghost btn-lg" href={WINDOWS_INSTALLER_URL}>
                {HOME.hero.secondaryCta}
              </a>
            </div>
            <ul className="ref-checks">
              {HOME.hero.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            <div
              className={`ref-guest ${drag || phase !== "idle" ? "active" : ""}`}
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
                  <strong>Kéo PDF vào đây để ký</strong>
                  <button type="button" className="btn btn-soft btn-sm" onClick={openUpload}>
                    Chọn file
                  </button>
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
          <ContractMock />
        </div>
      </section>

      <section className="ref-providers">
        <div className="home-wrap ref-providers-inner">
          <span>{HOME.providers.label}</span>
          {HOME.providers.names.map((n) => (
            <strong key={n}>{n}</strong>
          ))}
          <span>{HOME.providers.suffix}</span>
        </div>
      </section>

      <section className="ref-how" id="cach-hoat-dong">
        <div className="home-wrap">
          <div className="home-eyebrow">{HOME.how.eyebrow}</div>
          <h2 className="home-h2">{HOME.how.title}</h2>
          <p className="home-lead">{HOME.how.lead}</p>
          <div className="ref-steps">
            {HOME.how.steps.map((s, i) => (
              <article key={s.title} className="ref-step">
                <div
                  className={`ref-step-visual ${
                    i === 0 ? "viz-upload" : i === 1 ? "viz-box" : "viz-pin"
                  }`}
                />
                <div className="n">Bước {i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ref-features" id="tinh-nang">
        <div className="home-wrap">
          <div className="home-eyebrow">{HOME.features.eyebrow}</div>
          <h2 className="home-h2">{HOME.features.title}</h2>
          <div className="ref-feat-grid">
            <article className="ref-card">
              <h3>{HOME.features.local.title}</h3>
              <p>{HOME.features.local.body}</p>
              <div className="flow-nodes">
                {HOME.features.local.nodes.map((n, i) => (
                  <div key={n.label} className={`flow-node ${i === 1 ? "accent" : ""}`}>
                    <strong>{n.label}</strong>
                    <span>{n.detail}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="ref-card">
              <h3>{HOME.features.verify.title}</h3>
              <p>{HOME.features.verify.body}</p>
              <div className="verify-card">
                <div className="ok">{HOME.features.verify.result}</div>
                {HOME.features.verify.rows.map((r) => (
                  <div key={r.k} className="verify-row">
                    <span>{r.k}</span>
                    <b>{r.v}</b>
                  </div>
                ))}
              </div>
            </article>
          </div>
          <div className="ref-mini-grid">
            {HOME.features.cards.map((c) => (
              <article key={c.title} className="ref-card ref-mini">
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ref-security" id="bao-mat">
        <div className="home-wrap">
          <div className="home-eyebrow">{HOME.security.eyebrow}</div>
          <h2 className="home-h2">{HOME.security.title}</h2>
          <div className="ref-sec-grid">
            <div>
              <p className="home-lead" style={{ maxWidth: "42ch" }}>
                {HOME.security.lead}
              </p>
            </div>
            <div className="ref-sec-items">
              {securityItems.map((item) => {
                let title = item.title;
                if ("fact" in item && item.fact === "fileRetentionDays" && facts.fileRetentionDays != null) {
                  title = `File tự xóa sau ${facts.fileRetentionDays} ngày`;
                }
                if ("fact" in item && item.fact === "dataLocation" && facts.dataLocation) {
                  title = `Dữ liệu đặt tại ${facts.dataLocation}`;
                }
                return (
                  <div key={title} className="ref-sec-item">
                    <strong>{title}</strong>
                    <p>{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ref-windows" id="tai-app">
            <div>
              <h3>{HOME.windowsApp.title}</h3>
              <p>{HOME.windowsApp.lead}</p>
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <a className="btn btn-primary" href={WINDOWS_INSTALLER_URL}>
                  {HOME.windowsApp.download}
                </a>
                <a className="btn btn-ghost" style={{ color: "#e2e8f0", borderColor: "#334155" }} href={WINDOWS_INSTALL_GUIDE_URL}>
                  {HOME.windowsApp.guide}
                </a>
              </div>
              <div className="meta">{windowsMeta}</div>
            </div>
            <div className="win-mock">
              <div className="win-mock-bar">
                <span>PDFSign</span>
                <span>Đang chạy</span>
              </div>
              <div className="win-mock-body">
                <div className="row">USB token · Viettel-CA · đã nhận</div>
                <div className="row">Chứng thư · Nguyễn Văn A · còn hạn</div>
                <div className="row ready">Sẵn sàng nhận lệnh ký từ trình duyệt</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showSocial && (
        <section className="ref-social">
          <div className="home-wrap ref-social-grid">
            {showStats && (
              <div className="ref-stats">
                {facts.statsSignedFiles && (
                  <div className="ref-stat">
                    <div className="num">{facts.statsSignedFiles}</div>
                    <div className="lbl">file đã ký trên PDFSign</div>
                  </div>
                )}
                {facts.statsCompanies && (
                  <div className="ref-stat">
                    <div className="num">{facts.statsCompanies}</div>
                    <div className="lbl">doanh nghiệp đang dùng</div>
                  </div>
                )}
              </div>
            )}
            {showTestimonial && facts.testimonial && (
              <blockquote className="ref-quote">
                <p>“{facts.testimonial.quote}”</p>
                <cite>
                  {facts.testimonial.name} · {facts.testimonial.role}, {facts.testimonial.company}
                </cite>
              </blockquote>
            )}
          </div>
        </section>
      )}

      <section className="ref-pricing" id="bang-gia">
        <div className="home-wrap">
          <div className="home-eyebrow">{HOME.pricing.eyebrow}</div>
          <h2 className="home-h2">{HOME.pricing.title}</h2>
          <p className="home-lead">{HOME.pricing.lead}</p>
          <div className="ref-price-grid">
            {HOME.pricing.tiers.map((t) => (
              <article key={t.id} className={`ref-price ${t.featured ? "featured" : ""}`}>
                {"badge" in t && t.badge && <span className="badge">{t.badge}</span>}
                <div className="name">{t.name}</div>
                <div className="blurb">{t.blurb}</div>
                <div className="amt">
                  {t.price}
                  {t.period && <span>{t.period}</span>}
                </div>
                {t.id === "pro" && facts.proYearlyPrice && (
                  <div className="yearly">
                    hoặc {facts.proYearlyPrice} / năm
                    {facts.proYearlySavingsPercent != null
                      ? `, tiết kiệm ${facts.proYearlySavingsPercent}%`
                      : ""}
                  </div>
                )}
                <ul>
                  {t.id === "pro" && facts.proFileCount && (
                    <li>{facts.proFileCount} file mỗi tháng</li>
                  )}
                  {t.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {t.id === "enterprise" ? (
                  <a className="btn btn-ghost" href={facts.hotline ? `tel:${facts.hotline}` : "mailto:info@pdfsign.vn"}>
                    {t.cta}
                  </a>
                ) : t.id === "free" ? (
                  <button type="button" className="btn btn-ghost" onClick={openUpload}>
                    {t.cta}
                  </button>
                ) : (
                  <Link className="btn btn-primary" to={user ? "/documents" : "/register"}>
                    {t.cta}
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ref-faq" id="faq">
        <div className="home-wrap">
          <div className="home-eyebrow">{HOME.faq.eyebrow}</div>
          <h2 className="home-h2">{HOME.faq.title}</h2>
          <p className="home-lead" style={{ marginBottom: 24 }}>
            {faqLead}
          </p>
          {HOME.faq.items.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="ref-cta">
        <div className="home-wrap">
          <div className="ref-cta-band">
            <div>
              <h2>{HOME.ctaBand.title}</h2>
              <p>{HOME.ctaBand.lead}</p>
            </div>
            <div className="ref-cta-actions">
              <button type="button" className="btn btn-on-brand" onClick={openUpload}>
                {HOME.ctaBand.primary}
              </button>
              <a
                className="btn btn-on-brand-ghost"
                href={facts.hotline ? `tel:${facts.hotline}` : "mailto:info@pdfsign.vn"}
              >
                {HOME.ctaBand.secondary}
              </a>
            </div>
          </div>
        </div>
      </section>

      <AuthGateModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onAuth={onAuthed}
        resumeHint="Đã dùng hết 2 file miễn phí. Đăng nhập để tiếp tục file này."
      />
    </div>
  );
}
