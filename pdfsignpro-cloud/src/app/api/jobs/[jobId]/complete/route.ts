import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { verifyJobToken } from "@/lib/job-token";

export async function POST(
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

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = (formData.get("file") ?? formData.get("signedPdf")) as File | null;
    const certMetaRaw = formData.get("certMeta");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid file (signed PDF)" },
        { status: 400 }
      );
    }

    let certMetaJson: string | null = null;
    if (typeof certMetaRaw === "string" && certMetaRaw.trim()) {
      try {
        JSON.parse(certMetaRaw);
        certMetaJson = certMetaRaw;
      } catch {
        return NextResponse.json(
          { error: "certMeta must be valid JSON" },
          { status: 400 }
        );
      }
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const nextVersion = job.documentVersion.version + 1;
    const storageKey = `documents/${job.document.publicId}/v${nextVersion}.pdf`;

    const storage = getStorageDriver();
    await storage.upload(storageKey, buffer, "application/pdf");

    const outputVersion = await prisma.documentVersion.create({
      data: {
        documentId: job.documentId,
        version: nextVersion,
        storageKey,
        storageDriver: process.env.STORAGE_DRIVER ?? "r2",
        sizeBytes: buffer.length,
      },
    });

    await prisma.signingJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        outputVersionId: outputVersion.id,
        certMetaJson,
        completedAt: new Date(),
      },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const signedPublicUrl = `${appUrl}/d/${job.document.publicId}`;

    return NextResponse.json({
      signedPublicUrl,
      versionNumber: nextVersion,
      jobId,
      documentId: job.documentId,
      publicId: job.document.publicId,
    });
  } catch (err) {
    console.error("POST /api/jobs/[jobId]/complete error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
