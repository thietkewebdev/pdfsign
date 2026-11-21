import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Doc } from "../api";

export default function DashboardPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ documents: Doc[] }>("/documents")
      .then((d) => setDocs(d.documents || []))
      .catch((e) => setError(e.message));
  }, []);

  const total = docs?.length ?? 0;
  const recent = (docs || []).slice(0, 5);

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Tổng quan</h1>
      </div>

      {error && <div className="error">{error}</div>}

      {docs === null ? (
        <div className="stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat">
              <div className="skeleton" style={{ height: 12, width: 64 }} />
              <div className="skeleton" style={{ height: 28, width: 48, marginTop: 10 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="stats">
          <div className="stat">
            <div className="label">Tài liệu</div>
            <div className="value">{total}</div>
          </div>
          <div className="stat">
            <div className="label">Hôm nay</div>
            <div className="value">
              {
                docs.filter((d) => {
                  if (!d.createdAt) return false;
                  const t = new Date(d.createdAt);
                  const n = new Date();
                  return t.toDateString() === n.toDateString();
                }).length
              }
            </div>
          </div>
          <div className="stat">
            <div className="label">Phiên bản</div>
            <div className="value">{docs.reduce((s, d) => s + (d.version || 1), 0)}</div>
          </div>
          <div className="stat">
            <div className="label">Trạng thái</div>
            <div className="value" style={{ fontSize: 18, marginTop: 8 }}>
              Sẵn sàng
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <Link className="btn btn-primary" to="/documents">
          Tài liệu
        </Link>
        <Link className="btn btn-ghost" to="/verify">
          Xác minh
        </Link>
      </div>

      <div className="card">
        <div className="panel-title card-pad" style={{ paddingBottom: 0 }}>
          <h2 className="h3">Gần đây</h2>
          <Link to="/documents">Xem tất cả</Link>
        </div>
        {docs === null ? (
          <div className="card-pad">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8 }} />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="empty">
            <strong>Chưa có tài liệu</strong>
            <Link className="btn btn-primary btn-sm" to="/documents" style={{ marginTop: 12 }}>
              Tải PDF lên
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
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
                {recent.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title || d.publicId}</td>
                    <td>v{d.version}</td>
                    <td className="muted">
                      {d.createdAt ? new Date(d.createdAt).toLocaleString("vi-VN") : ""}
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
