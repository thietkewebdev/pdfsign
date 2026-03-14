import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog-data";

export const alt = "PDFSignPro Cloud Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  const title = post?.title ?? "PDFSignPro Cloud";
  const category = post?.category ?? "Blog";
  const emoji = post?.emoji ?? "📄";
  const [g1, g2] = post?.gradient ?? ["#7c3aed", "#2563eb"];

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 60,
          background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                padding: "6px 16px",
                background: "rgba(255,255,255,0.2)",
                borderRadius: 8,
                fontSize: 18,
                color: "white",
                fontWeight: 500,
              }}
            >
              {category}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 24,
            }}
          >
            <div style={{ fontSize: 72, lineHeight: 1 }}>{emoji}</div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: "white",
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                maxWidth: 900,
              }}
            >
              {title}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.9)",
              fontWeight: 600,
            }}
          >
            PDFSignPro Cloud
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            pdfsign.vn/blog
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
