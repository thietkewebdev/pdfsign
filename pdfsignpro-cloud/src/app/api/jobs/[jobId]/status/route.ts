import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";

const JobStatusSchema = z.object({
  status: z.enum(["CREATED", "COMPLETED", "EXPIRED", "CANCELED"]),
  expiresAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  outputVersionId: z.string().nullable().optional(),
  signedDownloadUrl: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = await prisma.signingJob.findUnique({
      where: { id: jobId },
      include: { outputVersion: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
      signedDownloadUrl,
    };

    const parsed = JobStatusSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid response shape", details: parsed.error },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed.data);
  } catch (err) {
    console.error("GET /api/jobs/[jobId]/status error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
