import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Doc, documentStatusLabel, formatRemaining } from "../api";
import { useToast } from "../toast";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [retentionLabel, setRetentionLabel] = useState("Tự xóa sau 2 ngày");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "today" | "week">("all");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const toast = useToast();

  async function refresh() {
    const data = await api<{ documents: Doc[]; retentionLabel?: string }>("/documents");
    setDocs(data.documents || []);
    if (data.retentionLabel) setRetentionLabel(data.retentionLabel);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    let list = docs || [];
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (d) =>
          (d.title || "").toLowerCase().includes(qq) ||
          d.publicId.toLowerCase().includes(qq),
      );
    }
    if (filter === "today" || filter === "week") {
      const now = Date.now();
      const ms = filter === "today" ? 86400000 : 7 * 86400000;
      list = list.filter((d) => {
        if (!d.createdAt) return false;
        return now - new Date(d.createdAt).getTime() <= ms;
      });
    }
    return list;
  }, [docs, q, filter]);

  async function onFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      const res = await api<{ publicId: string }>("/documents", { method: "POST", body: fd });
      toast.push("Đã tải lên", "ok");
      nav(`/d/${res.publicId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tải lên lỗi";
      setError(msg);
      toast.push(msg, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="h1">Tài liệu</h1>
          <span className="badge badge-warn" style={{ marginTop: 8 }}>
            {retentionLabel}
          </span>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Đang tải…" : "Tải PDF lên"}
        </button>
        <div className="search">
          <input
            type="search"
            placeholder="Tìm kiếm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Tìm kiếm"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Bộ lọc"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: "10px 12px",
            background: "#fff",
          }}
        >
          <option value="all">Tất cả</option>
          <option value="today">Hôm nay</option>
          <option value="week">7 ngày</option>
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>

      <div
        className={`drop ${drag ? "drag" : ""}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <strong>Kéo PDF vào đây</strong>
        <span className="muted">hoặc chọn file</span>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        {docs === null ? (
          <div className="card-pad">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <strong>{docs.length === 0 ? "Chưa có tài liệu" : "Không có kết quả"}</strong>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Trạng thái</th>
                  <th>Phiên bản</th>
                  <th>Ngày</th>
                  <th>Lưu trữ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title || d.publicId}</td>
                    <td>
                      <span
                        className={`badge ${
                          (d.version || 1) > 1 ? "badge-ok" : "badge-warn"
                        }`}
                      >
                        {d.statusLabel || documentStatusLabel(d.status, d.version)}
                      </span>
                    </td>
                    <td>v{d.version}</td>
                    <td className="muted">
                      {d.createdAt ? new Date(d.createdAt).toLocaleString("vi-VN") : ""}
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      <div>{d.retentionLabel || retentionLabel}</div>
                      <div>{formatRemaining(d.remainingSeconds)}</div>
                    </td>
                    <td>
                      <Link to={`/d/${d.publicId}`}>Mở</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
