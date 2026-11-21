import { useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";

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
  const [drag, setDrag] = useState(false);
  const toast = useToast();

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
      toast.push(res.ok ? "Hợp lệ" : "Không hợp lệ", res.ok ? "ok" : "err");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi";
      setError(msg);
      toast.push(msg, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="h1">Xác minh</h1>
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
        <strong>{busy ? "Đang kiểm tra…" : "Chọn PDF"}</strong>
        <span className="muted">kéo thả hoặc bấm chọn</span>
      </div>
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

      {error && <div className="error" role="alert">{error}</div>}

      {ok !== null && (
        <div
          className="card card-pad"
          style={{
            marginTop: 16,
            borderColor: ok ? "#bbf7d0" : "#fecaca",
            background: ok ? "var(--ok-bg)" : "var(--bad-bg)",
          }}
          role="status"
        >
          <div className="h2" style={{ color: ok ? "var(--ok)" : "var(--bad)" }}>
            {ok ? "Hợp lệ" : "Không hợp lệ"}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        {busy && (
          <div className="card-pad">
            <div className="skeleton" style={{ height: 56, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 56 }} />
          </div>
        )}
        {!busy && sigs.length === 0 && ok === null && (
          <div className="empty">
            <strong>Chưa có kết quả</strong>
          </div>
        )}
        {!busy && sigs.length === 0 && ok === false && (
          <div className="empty">
            <strong>Không tìm thấy chữ ký</strong>
          </div>
        )}
        {!busy &&
          sigs.map((s, i) => {
            const good = !!(s.digestOk && s.signatureOk);
            return (
              <div
                key={i}
                style={{
                  padding: "16px 18px",
                  borderBottom: i < sigs.length - 1 ? "1px solid var(--line)" : undefined,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <strong>{s.field || `Signature${i + 1}`}</strong>
                  <span className={`badge ${good ? "badge-ok" : "badge-bad"}`}>
                    {s.level || (good ? "OK" : "FAIL")}
                  </span>
                </div>
                <div className="muted">Người ký: {s.signerCn || "N/A"}</div>
                <div className="muted">Serial: {s.serial || "N/A"}</div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Digest {s.digestOk ? "OK" : "FAIL"} · Sig {s.signatureOk ? "OK" : "FAIL"} ·
                  ByteRange {s.coversWholeFile ? "đủ" : "thiếu"} · LTV {s.ltv ? "OK" : "không"}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
