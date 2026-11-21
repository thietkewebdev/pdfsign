import { useRef, useState } from "react";
import { api } from "../api";

type Sig = {
  field?: string;
  level?: string;
  digestOk?: boolean;
  signatureOk?: boolean;
  coversWholeFile?: boolean;
  signerCn?: string;
  serial?: string;
  ltv?: boolean;
};

export default function VerifyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [sigs, setSigs] = useState<Sig[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setError("");
    setOk(null);
    setSigs([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ ok: boolean; signatures: Sig[] }>("/verify", {
        method: "POST",
        body: fd,
      });
      setOk(res.ok);
      setSigs(res.signatures || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Xác minh</h1>
      <p className="page-sub">Kiểm tra chữ ký PAdES trên PDF</p>
      <div className="toolbar">
        <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          Chọn PDF
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </div>
      {error && <div className="error">{error}</div>}
      {ok !== null && (
        <p className={ok ? "ok" : "error"}>{ok ? "Chữ ký hợp lệ" : "Chữ ký không hợp lệ"}</p>
      )}
      <div className="card">
        {sigs.map((s, i) => (
          <div key={i} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
            <div>
              <strong>{s.field || `Signature${i + 1}`}</strong>{" "}
              <span className={`badge ${s.digestOk && s.signatureOk ? "badge-ok" : "badge-bad"}`}>
                {s.level || "?"}
              </span>
            </div>
            <div className="muted">Người ký: {s.signerCn || "—"}</div>
            <div className="muted">Serial: {s.serial || "—"}</div>
            <div className="muted">
              Digest {s.digestOk ? "OK" : "FAIL"} · Sig {s.signatureOk ? "OK" : "FAIL"} · ByteRange{" "}
              {s.coversWholeFile ? "đủ" : "thiếu"} · LTV {s.ltv ? "OK" : "không"}
            </div>
          </div>
        ))}
        {!sigs.length && <div className="muted">Chưa có kết quả</div>}
      </div>
    </div>
  );
}
