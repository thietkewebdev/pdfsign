import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyClaimCode } from "@/lib/claim-code";
import { recordSigningErrorEvent } from "@/lib/admin-events";

const ClaimSchema = z.object({
  code: z.string().min(1).max(32),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const routePath = "/api/jobs/[jobId]/claim";
  const track = (errorCode: string) =>
    recordSigningErrorEvent({ errorCode, path: routePath, method: "POST" }).catch(() => undefined);

  try {
    const { jobId } = await params;

    const body = await request.json();
    const parsed = ClaimSchema.safeParse(body);
    if (!parsed.success) {
      void track("INVALID_REQUEST");
      return NextResponse.json(
        {
          error: "Invalid request",
          errorCode: "INVALID_REQUEST",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { code } = parsed.data;

    const job = await prisma.signingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      void track("JOB_NOT_FOUND");
      return NextResponse.json(
        { error: "Job not found", errorCode: "JOB_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (job.status !== "CREATED") {
      void track("JOB_NOT_AVAILABLE");
      return NextResponse.json(
        { error: "Job is not available for signing", errorCode: "JOB_NOT_AVAILABLE" },
        { status: 400 }
      );
    }

    const now = new Date();
    if (job.expiresAt && now > job.expiresAt) {
      void track("JOB_EXPIRED");
      return NextResponse.json(
        { error: "Job has expired", errorCode: "JOB_EXPIRED" },
        { status: 410 }
      );
    }

    if (job.claimedAt) {
      void track("CLAIM_ALREADY_USED");
      return NextResponse.json(
        { error: "Claim code has already been used", errorCode: "CLAIM_ALREADY_USED" },
        { status: 409 }
      );
    }

    if (!job.claimCodeHash) {
      void track("CLAIM_NOT_SUPPORTED");
      return NextResponse.json(
        { error: "Job was created before claim flow", errorCode: "CLAIM_NOT_SUPPORTED" },
        { status: 400 }
      );
    }
    if (!verifyClaimCode(code, job.claimCodeHash)) {
      void track("INVALID_CLAIM_CODE");
      return NextResponse.json(
        { error: "Invalid claim code", errorCode: "INVALID_CLAIM_CODE" },
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
      void track("CLAIM_NOT_SUPPORTED");
      return NextResponse.json(
        { error: "Job was created before claim flow", errorCode: "CLAIM_NOT_SUPPORTED" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      jobToken: job.jobToken,
      apiBaseUrl,
    });
  } catch (err) {
    void track("INTERNAL_SERVER_ERROR");
    console.error("POST /api/jobs/[jobId]/claim error:", err);
    return NextResponse.json(
      { error: "Internal server error", errorCode: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
