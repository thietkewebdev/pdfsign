import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { verifyJobToken } from "@/lib/job-token";
import { recordSigningErrorEvent } from "@/lib/admin-events";

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
  const routePath = "/api/jobs/[jobId]";
  const track = (errorCode: string) =>
    recordSigningErrorEvent({ errorCode, path: routePath, method: "GET" }).catch(() => undefined);

  try {
    const { jobId } = await params;
    const jobToken = request.headers.get("x-job-token");

    if (!jobToken) {
      void track("MISSING_JOB_TOKEN");
      return NextResponse.json(
        { error: "Missing x-job-token header", errorCode: "MISSING_JOB_TOKEN" },
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
      void track("JOB_NOT_FOUND");
      return NextResponse.json(
        { error: "Job not found", errorCode: "JOB_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!verifyJobToken(jobToken, job.jobTokenHash)) {
      void track("INVALID_JOB_TOKEN");
      return NextResponse.json(
        { error: "Invalid token", errorCode: "INVALID_JOB_TOKEN" },
        { status: 401 }
      );
    }

    if (job.status !== "CREATED") {
      void track("JOB_NOT_AVAILABLE");
      return NextResponse.json(
        { error: "Job is not available for signing", errorCode: "JOB_NOT_AVAILABLE" },
        { status: 400 }
      );
    }

    if (job.expiresAt && new Date() > job.expiresAt) {
      void track("JOB_EXPIRED");
      return NextResponse.json(
        { error: "Job has expired", errorCode: "JOB_EXPIRED" },
        { status: 410 }
      );
    }

    const storage = getStorageDriver();
    const inputPdfUrl = await storage.getPresignedUrl(
      job.documentVersion.storageKey,
      3600
    );

    let sealImageUrl: string | undefined;
    if (job.sealImageKey) {
      sealImageUrl = await storage.getPresignedUrl(job.sealImageKey, 3600);
    }

    let placement: { page: number | "LAST"; rectPct: { x: number; y: number; w: number; h: number } };
    try {
      const raw = JSON.parse(job.placementJson);
      placement = normalizePlacement(raw);
    } catch (err) {
      void track("INVALID_PLACEMENT");
      console.error("Invalid placementJson:", job.placementJson, err);
      return NextResponse.json(
        {
          error: "Invalid placement: rectPct must be { x, y, w, h } with 4 numeric values 0..1",
          errorCode: "INVALID_PLACEMENT",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      document: {
        title: job.document.title,
        publicId: job.document.publicId,
      },
      inputPdfUrl,
      sealImageUrl,
      placement,
      status: job.status,
    });
  } catch (err) {
    void track("INTERNAL_SERVER_ERROR");
    console.error("GET /api/jobs/[jobId] error:", err);
    return NextResponse.json(
      { error: "Internal server error", errorCode: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
