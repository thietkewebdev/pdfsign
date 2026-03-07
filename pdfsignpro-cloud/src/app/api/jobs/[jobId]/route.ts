import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { verifyJobToken } from "@/lib/job-token";

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

    const placement = JSON.parse(job.placementJson);

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
