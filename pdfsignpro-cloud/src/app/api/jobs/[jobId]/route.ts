import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { verifyJobToken } from "@/lib/job-token";

/** Normalize placement to { page, rectPct: { x, y, w, h } } with 4 numeric values in 0..1 */
function normalizePlacement(raw: unknown): {
  page: number | "LAST";
  rectPct: { x: number; y: number; w: number; h: number };
} {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object") {
    throw new Error("placement must be an object");
  }

  const pageRaw = p.page;
  const page: number | "LAST" =
    pageRaw === "LAST" || pageRaw === "last"
      ? "LAST"
      : typeof pageRaw === "number" && Number.isInteger(pageRaw) && pageRaw > 0
        ? pageRaw
        : "LAST";

  const rectRaw = (p.rectPct ?? p) as Record<string, unknown> | null;
  if (!rectRaw || typeof rectRaw !== "object") {
    throw new Error("placement.rectPct must be { x, y, w, h } with 4 numeric values 0..1");
  }

  const clamp = (v: unknown, name: string): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new Error(`placement.rectPct.${name} must be a number 0..1`);
    }
    return n;
  };

  return {
    page,
    rectPct: {
      x: clamp(rectRaw.x ?? rectRaw.xPct, "x"),
      y: clamp(rectRaw.y ?? rectRaw.yPct, "y"),
      w: clamp(rectRaw.w ?? rectRaw.wPct, "w"),
      h: clamp(rectRaw.h ?? rectRaw.hPct, "h"),
    },
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const jobToken = request.headers.get("x-job-token");

    if (!jobToken) {
      return NextResponse.json(
        { error: "Missing x-job-token header" },
        { status: 401 }
      );
    }

    const job = await prisma.signingJob.findUnique({
      where: { id: jobId },
      include: {
        document: true,
        documentVersion: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!verifyJobToken(jobToken, job.jobTokenHash)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (job.status !== "CREATED") {
      return NextResponse.json(
        { error: "Job is not available for signing" },
        { status: 400 }
      );
    }

    if (job.expiresAt && new Date() > job.expiresAt) {
      return NextResponse.json(
        { error: "Job has expired" },
        { status: 410 }
      );
    }

    const storage = getStorageDriver();
    const inputPdfUrl = await storage.getPresignedUrl(
      job.documentVersion.storageKey,
      3600
    );

    let placement: { page: number | "LAST"; rectPct: { x: number; y: number; w: number; h: number } };
    try {
      const raw = JSON.parse(job.placementJson);
      placement = normalizePlacement(raw);
    } catch (err) {
      console.error("Invalid placementJson:", job.placementJson, err);
      return NextResponse.json(
        { error: "Invalid placement: rectPct must be { x, y, w, h } with 4 numeric values 0..1" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      document: {
        title: job.document.title,
        publicId: job.document.publicId,
      },
      inputPdfUrl,
      placement,
      status: job.status,
    });
  } catch (err) {
    console.error("GET /api/jobs/[jobId] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
