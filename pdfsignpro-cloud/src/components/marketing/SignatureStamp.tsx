"use client";

import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

export type SignatureStampVariant = "dark" | "light";

export interface SignatureStampProps {
  companyName?: string;
  signedAt?: string;
  variant?: SignatureStampVariant;
  className?: string;
}

function formatSignedAt(value: string): string {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${h}:${m}`;
  } catch {
    return value;
  }
}

export function SignatureStamp({
  companyName = "Công ty TNHH ABC",
  signedAt = "12/10/2026 14:30",
  variant = "dark",
  className,
}: SignatureStampProps) {
  const formattedTime = useMemo(
    () => (signedAt.includes("/") && signedAt.includes(":") ? signedAt : formatSignedAt(signedAt)),
    [signedAt]
  );

  const displayCompany = companyName;

  const isDark = variant === "dark";
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const bgId = `stamp-bg-${uid}`;
  const borderId = `stamp-border-${uid}`;

  return (
    <svg
      viewBox="0 0 280 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block", className)}
      role="img"
      aria-label="Đã ký số"
    >
      <defs>
        <linearGradient
          id={bgId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop
            offset="0%"
            stopColor={isDark ? "#059669" : "#10b981"}
            stopOpacity={isDark ? 0.15 : 0.2}
          />
          <stop
            offset="100%"
            stopColor={isDark ? "#0d9488" : "#14b8a6"}
            stopOpacity={isDark ? 0.08 : 0.12}
          />
        </linearGradient>
        <linearGradient
          id={borderId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop
            offset="0%"
            stopColor={isDark ? "#34d399" : "#059669"}
            stopOpacity={isDark ? 0.6 : 0.8}
          />
          <stop
            offset="100%"
            stopColor={isDark ? "#2dd4bf" : "#0d9488"}
            stopOpacity={isDark ? 0.5 : 0.7}
          />
        </linearGradient>
      </defs>

      {/* Rounded rect background */}
      <rect
        x="1"
        y="1"
        width="278"
        height="70"
        rx="10"
        ry="10"
        fill={`url(#${bgId})`}
      />
      <rect
        x="1"
        y="1"
        width="278"
        height="70"
        rx="10"
        ry="10"
        fill="none"
        stroke={`url(#${borderId})`}
        strokeWidth="1.5"
      />

      {/* Check-in-circle icon (left) */}
      <g transform="translate(16, 22) scale(0.75)">
        <circle
          cx="16"
          cy="16"
          r="14"
          fill={isDark ? "rgba(52, 211, 153, 0.25)" : "rgba(16, 185, 129, 0.3)"}
          stroke={isDark ? "#34d399" : "#059669"}
          strokeWidth="1.5"
        />
        <path
          d="M10 16l5 5 10-10"
          stroke={isDark ? "#34d399" : "#059669"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* Text block (right) - foreignObject for word wrap */}
      <foreignObject x="72" y="12" width="196" height="48">
        <div
          style={{
            width: "100%",
            overflow: "hidden",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: "11px",
            lineHeight: 1.35,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: "13px",
              color: isDark ? "#e5e7eb" : "#1f2937",
              marginBottom: 2,
            }}
          >
            Đã ký số
          </div>
          <div
            style={{
              color: isDark ? "#9ca3af" : "#4b5563",
              marginBottom: 2,
            }}
          >
            Ký bởi: {displayCompany}
          </div>
          <div
            style={{
              color: isDark ? "#9ca3af" : "#4b5563",
            }}
          >
            Thời gian: {formattedTime}
          </div>
        </div>
      </foreignObject>
    </svg>
  );
}
