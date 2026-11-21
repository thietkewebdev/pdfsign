import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";

type JobState = {
  jobId: string;
  deepLink: string;
  claimCode?: string;
  expiresAt?: string;
};

export default function JobPage() {
  const { jobId = "" } = useParams();
  const loc = useLocation();
  const initial = (loc.state || {}) as JobState;
  const [deepLink, setDeepLink] = useState(initial.deepLink || "");
  const [status, setStatus] = useState("CREATED");
  const [download, setDownload] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deepLink && jobId) {
      // Status endpoint is public; deep link only known at create time.
      setDeepLink(`pdfsignpro://sign?p=`);
    }
  }, [deepLink, jobId]);

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
        if (s.status === "CREATED") setTimeout(tick, 2000);
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
      <h1 className="page-title">Phiên ký</h1>
      <p className="page-sub">{jobId}</p>
      {error && <div className="error">{error}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <p>
          Trạng thái:{" "}
          <span
            className={
              "badge " +
              (status === "COMPLETED" ? "badge-ok" : status === "EXPIRED" ? "badge-bad" : "badge-warn")
            }
          >
            {status}
          </span>
        </p>
        {deepLink && deepLink !== "pdfsignpro://sign?p=" && (
          <>
            <p className="muted">Deep link</p>
            <div className="code">{deepLink}</div>
            <div className="toolbar" style={{ marginTop: 14 }}>
              <a className="btn btn-primary" href={deepLink}>
                Mở app ký
              </a>
              <button
                className="btn btn-ghost"
                onClick={() => navigator.clipboard.writeText(deepLink)}
              >
                Sao chép link
              </button>
            </div>
          </>
        )}
        {download && (
          <p style={{ marginTop: 16 }}>
            <a className="btn btn-primary" href={download}>
              Tải PDF đã ký
            </a>
          </p>
        )}
        <p style={{ marginTop: 18 }}>
          <Link to="/documents">Về danh sách</Link>
        </p>
      </div>
    </div>
  );
}
