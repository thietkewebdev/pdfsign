import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { recordSigningErrorEvent } from "@/lib/admin-events";

const JobStatusSchema = z.object({
  status: z.enum(["CREATED", "COMPLETED", "EXPIRED", "CANCELED"]),
  expiresAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  outputVersionId: z.string().nullable().optional(),
  outputVersion: z
    .object({ version: z.number(), storageKey: z.string() })
    .nullable()
    .optional(),
  signedDownloadUrl: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const routePath = "/api/jobs/[jobId]/status";
  const track = (errorCode: string) =>
    recordSigningErrorEvent({ errorCode, path: routePath, method: "GET" }).catch(() => undefined);

  try {
    const { jobId } = await params;

    const job = await prisma.signingJob.findUnique({
      where: { id: jobId },
      include: { outputVersion: true },
    });

    if (!job) {
      void track("JOB_NOT_FOUND");
      return NextResponse.json(
        { error: "Job not found", errorCode: "JOB_NOT_FOUND" },
        { status: 404 }
      );
    }

    const now = new Date();
    const isExpired = job.expiresAt && now > job.expiresAt;

    if (job.status === "CREATED" && isExpired) {
      await prisma.signingJob.update({
        where: { id: jobId },
        data: { status: "EXPIRED" },
      });
    }

    const status = isExpired && job.status === "CREATED" ? "EXPIRED" : job.status;

    let signedDownloadUrl: string | null = null;
    if (job.status === "COMPLETED" && job.outputVersion) {
      const storage = getStorageDriver();
      signedDownloadUrl = await storage.getPresignedUrl(
        job.outputVersion.storageKey,
        3600
      );
    }

    const payload = {
      status,
      expiresAt: job.expiresAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      outputVersionId: job.outputVersionId ?? null,
      outputVersion:
        job.status === "COMPLETED" && job.outputVersion
          ? {
              version: job.outputVersion.version,
              storageKey: job.outputVersion.storageKey,
            }
          : null,
      signedDownloadUrl,
    };

    const parsed = JobStatusSchema.safeParse(payload);
    if (!parsed.success) {
      void track("INVALID_RESPONSE_SHAPE");
      return NextResponse.json(
        {
          error: "Invalid response shape",
          errorCode: "INVALID_RESPONSE_SHAPE",
          details: parsed.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed.data);
  } catch (err) {
    void track("INTERNAL_SERVER_ERROR");
    console.error("GET /api/jobs/[jobId]/status error:", err);
    return NextResponse.json(
      { error: "Internal server error", errorCode: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
