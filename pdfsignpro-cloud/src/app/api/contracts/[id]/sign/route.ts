import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateJobToken, hashJobToken } from "@/lib/job-token";
import { generateClaimCode, hashClaimCode } from "@/lib/claim-code";
import { base64urlEncode } from "@/lib/base64url";
import { checkQuota } from "@/lib/usage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params;
    const body = await request.json();
    const { token, placement, templateId } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Missing signer token" },
        { status: 400 }
      );
    }

    const signer = await prisma.contractSigner.findFirst({
      where: { contractId, token },
      include: {
        contract: {
          include: {
            document: {
              include: {
                versions: { orderBy: { version: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!signer) {
      return NextResponse.json(
        { error: "Invalid signer token" },
        { status: 403 }
      );
    }

    if (signer.contract.status === "EXPIRED") {
      return NextResponse.json(
        { error: "Contract has expired" },
        { status: 410 }
      );
    }

    if (signer.contract.expiresAt < new Date()) {
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "Contract has expired" },
        { status: 410 }
      );
    }

    if (signer.status === "COMPLETED") {
      return NextResponse.json(
        { error: "You have already signed this contract" },
        { status: 400 }
      );
    }

    if (signer.status !== "INVITED") {
      return NextResponse.json(
        { error: "It is not your turn to sign yet" },
        { status: 400 }
      );
    }

    if (signer.signingJobId) {
      const existingJob = await prisma.signingJob.findUnique({
        where: { id: signer.signingJobId },
      });
      if (existingJob && existingJob.status === "CREATED" && existingJob.expiresAt > new Date()) {
        const apiBaseUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const hostname = new URL(apiBaseUrl).hostname;
        const payload: Record<string, string> = {
          j: existingJob.id,
          c: "",
          h: hostname,
        };
        if (signer.templateId) payload.t = signer.templateId;
        const deepLink = `pdfsignpro://sign?p=${base64urlEncode(payload)}`;

        return NextResponse.json({
          jobId: existingJob.id,
          deepLink,
          expiresAt: existingJob.expiresAt.toISOString(),
        });
      }
    }

    const currentVersion = signer.contract.document.versions[0];
    if (!currentVersion) {
      return NextResponse.json(
        { error: "No document version found" },
        { status: 500 }
      );
    }

    const quota = await checkQuota(signer.contract.userId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: "Chủ hợp đồng đã đạt giới hạn 50 file ký/tháng. Vui lòng liên hệ hoặc chờ tháng sau.",
          code: "QUOTA_EXCEEDED",
          used: quota.used,
          limit: quota.limit,
        },
        { status: 402 }
      );
    }

    const jobToken = generateJobToken();
    const jobTokenHash = hashJobToken(jobToken);
    const claimCode = generateClaimCode();
    const claimCodeHash = hashClaimCode(claimCode);
    const jobId = `job_${randomBytes(8).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const finalPlacement = placement
      ? JSON.stringify(placement)
      : signer.placementJson;
    const finalTemplateId = templateId || signer.templateId;

    await prisma.signingJob.create({
      data: {
        id: jobId,
        documentVersionId: currentVersion.id,
        documentId: signer.contract.document.id,
        jobTokenHash,
        jobToken,
        claimCodeHash,
        status: "CREATED",
        placementJson: finalPlacement,
        expiresAt,
      },
    });

    await prisma.contractSigner.update({
      where: { id: signer.id },
      data: { signingJobId: jobId },
    });

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const hostname = new URL(apiBaseUrl).hostname;
    const payload: Record<string, string> = {
      j: jobId,
      c: claimCode,
      h: hostname,
    };
    if (finalTemplateId) payload.t = finalTemplateId;
    const deepLink = `pdfsignpro://sign?p=${base64urlEncode(payload)}`;

    return NextResponse.json({
      jobId,
      deepLink,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("POST /api/contracts/[id]/sign error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
