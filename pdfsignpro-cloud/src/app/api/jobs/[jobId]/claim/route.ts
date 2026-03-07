import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyClaimCode } from "@/lib/claim-code";

const ClaimSchema = z.object({
  code: z.string().min(1).max(32),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const body = await request.json();
    const parsed = ClaimSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { code } = parsed.data;

    const job = await prisma.signingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "CREATED") {
      return NextResponse.json(
        { error: "Job is not available for signing" },
        { status: 400 }
      );
    }

    const now = new Date();
    if (job.expiresAt && now > job.expiresAt) {
      return NextResponse.json(
        { error: "Job has expired" },
        { status: 410 }
      );
    }

    if (!job.claimCodeHash) {
      return NextResponse.json(
        { error: "Job was created before claim flow" },
        { status: 400 }
      );
    }
    if (!verifyClaimCode(code, job.claimCodeHash)) {
      return NextResponse.json(
        { error: "Invalid claim code" },
        { status: 401 }
      );
    }

    await prisma.signingJob.update({
      where: { id: jobId },
      data: { claimedAt: now },
    });

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (!job.jobToken) {
      return NextResponse.json(
        { error: "Job was created before claim flow" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      jobToken: job.jobToken,
      apiBaseUrl,
    });
  } catch (err) {
    console.error("POST /api/jobs/[jobId]/claim error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
