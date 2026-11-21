import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Doc } from "../api";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  async function refresh() {
    const data = await api<{ documents: Doc[] }>("/documents");
    setDocs(data.documents || []);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function onFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name);
      const res = await api<{ publicId: string }>("/documents", { method: "POST", body: fd });
      nav(`/d/${res.publicId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Tài liệu</h1>
      <p className="page-sub">Upload PDF và tạo phiên ký</p>
      <div className="toolbar">
        <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          Tải PDF lên
        </button>
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
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <strong>Kéo PDF vào đây</strong>
        <span className="muted">Hoặc bấm Tải PDF lên</span>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Phiên bản</th>
              <th>Ngày</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.title || d.publicId}</td>
                <td>v{d.version}</td>
                <td className="muted">{d.createdAt ? new Date(d.createdAt).toLocaleString("vi-VN") : ""}</td>
                <td>
                  <Link to={`/d/${d.publicId}`}>Mở</Link>
                </td>
              </tr>
            ))}
            {!docs.length && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có tài liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
