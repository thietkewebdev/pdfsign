import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../toast";

type JobState = {
  jobId: string;
  deepLink: string;
  expiresAt?: string;
};

const OPEN = new Set(["READY", "CREATED", "IN_PROGRESS"]);

export default function JobPage() {
  const { jobId = "" } = useParams();
  const loc = useLocation();
  const initial = (loc.state || {}) as JobState;
  const [deepLink, setDeepLink] = useState(initial.deepLink || "");
  const [status, setStatus] = useState("READY");
  const [download, setDownload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (initial.deepLink) setDeepLink(initial.deepLink);
  }, [initial.deepLink]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await api<{
          status: string;
          signedDownloadUrl?: string | null;
        }>(`/jobs/${jobId}/status`);
        if (stop) return;
        setStatus(s.status);
        if (s.signedDownloadUrl) setDownload(s.signedDownloadUrl);
        if (OPEN.has(s.status)) setTimeout(tick, 2000);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Lỗi");
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  const badge =
    status === "COMPLETED" ? "badge-ok" : status === "EXPIRED" ? "badge-bad" : "badge-warn";

  const statusLabel: Record<string, string> = {
    READY: "Sẵn sàng",
    CREATED: "Đã tạo",
    IN_PROGRESS: "Đang ký",
    COMPLETED: "Hoàn tất",
    EXPIRED: "Hết hạn",
  };

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Phiên ký</h1>
      </div>
      {error && <div className="error" role="alert">{error}</div>}

      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <div className="panel-title">
          <span className="muted">Trạng thái</span>
          <span className={`badge ${badge}`}>{statusLabel[status] || status}</span>
        </div>

        <div className="tiny" style={{ marginBottom: 16 }}>
          {jobId}
        </div>

        {deepLink && (
          <>
            <div className="code">{deepLink}</div>
            <div className="toolbar" style={{ marginTop: 14 }}>
              <a className="btn btn-primary" href={deepLink}>
                Mở app ký
              </a>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(deepLink);
                  toast.push("Đã sao chép", "ok");
                }}
              >
                Sao chép link
              </button>
            </div>
          </>
        )}

        {!deepLink && OPEN.has(status) && (
          <p className="muted">Mở lại từ trang đặt chữ ký để lấy link ký.</p>
        )}

        {download && (
          <p style={{ marginTop: 16 }}>
            <a className="btn btn-primary" href={download}>
              Tải PDF đã ký
            </a>
          </p>
        )}

        {OPEN.has(status) && (
          <div style={{ marginTop: 16 }}>
            <div className="skeleton" style={{ height: 8, width: "100%" }} />
            <div className="tiny" style={{ marginTop: 8 }}>
              Đang chờ app ký…
            </div>
          </div>
        )}

        <p style={{ marginTop: 18, marginBottom: 0 }}>
          <Link to="/documents">Về danh sách</Link>
        </p>
      </div>
    </div>
  );
}
