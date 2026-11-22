import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";
import { WINDOWS_INSTALLER_URL } from "../homeContent";

type JobState = {
  jobId: string;
  deepLink: string;
};

const OPEN = new Set(["READY", "CREATED", "IN_PROGRESS"]);
const APP_HINT_MS = 10_000;

export default function JobPage() {
  const { jobId = "" } = useParams();
  const loc = useLocation();
  const initial = (loc.state || {}) as JobState;
  const [deepLink] = useState(initial.deepLink || "");
  const [status, setStatus] = useState("READY");
  const [download, setDownload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAppHint, setShowAppHint] = useState(false);

  useEffect(() => {
    if (deepLink) {
      window.location.href = deepLink;
      const t = window.setTimeout(() => setShowAppHint(true), APP_HINT_MS);
      return () => window.clearTimeout(t);
    }
  }, [deepLink]);

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
        if (s.signedDownloadUrl) {
          setDownload(s.signedDownloadUrl);
          setShowAppHint(false);
          return;
        }
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

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">{download ? "Đã ký" : "Đang ký"}</h1>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="card card-pad" style={{ maxWidth: 480 }}>
        {download ? (
          <a className="btn btn-primary" href={download}>
            Tải PDF
          </a>
        ) : (
          <>
            <div className="skeleton" style={{ height: 8, width: "100%" }} />
            {showAppHint && (
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
                <a href={WINDOWS_INSTALLER_URL}>Tải app ký</a>
              </p>
            )}
            <p className="tiny" style={{ marginTop: 12, marginBottom: 0 }}>
              {status}
            </p>
          </>
        )}
        <p style={{ marginTop: 18, marginBottom: 0 }}>
          <Link to="/">Về trang chủ</Link>
        </p>
      </div>
    </div>
  );
}
