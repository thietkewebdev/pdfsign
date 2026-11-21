export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      ✓
    </div>
  );
}

export function BrandLockup({ dark = false }: { dark?: boolean }) {
  return (
    <div className="brand-row">
      <BrandMark />
      <div>
        <strong style={{ color: dark ? "#fff" : "var(--ink)" }}>PDFSign</strong>
        <span style={{ color: dark ? "#94a3b8" : "var(--muted)" }}>Ký số PDF</span>
      </div>
    </div>
  );
}
