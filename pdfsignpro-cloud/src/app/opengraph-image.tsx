import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PDFSignPro Cloud — Ký số PDF online bằng USB Token";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 600,
              color: "white",
              letterSpacing: "-0.02em",
            }}
          >
            PDFSignPro Cloud
          </div>
          <div
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "-0.01em",
            }}
          >
            Ký số PDF online bằng USB Token
          </div>
          <div
            style={{
              marginTop: 24,
              padding: "12px 24px",
              background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.2))",
              borderRadius: 12,
              fontSize: 20,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            Nhanh · Chuẩn · An toàn
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
