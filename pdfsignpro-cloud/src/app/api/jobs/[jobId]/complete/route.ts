import { Readable } from "node:stream";
import busboy from "busboy";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { verifyJobToken } from "@/lib/job-token";
import { sendSigningInvitation, sendContractCompleted } from "@/lib/email";

function parseMultipart(request: Request): Promise<{
  fileBuffer: Buffer;
  fileMimeType: string;
  certMetaRaw: string | null;
}> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get("content-type") ?? "";
    const bb = busboy({
      headers: { "content-type": contentType },
    });

    const fileChunks: Buffer[] = [];
    let fileMimeType = "application/pdf";
    let certMetaRaw: string | null = null;
    let fileReceived = false;

    bb.on("file", (name, stream, info) => {
      if (name === "file" || name === "signedPdf") {
        fileReceived = true;
        fileMimeType = info.mimeType ?? "application/pdf";
        stream.on("data", (chunk: Buffer) => fileChunks.push(chunk));
      } else {
        stream.resume();
      }
    });

    bb.on("field", (name, value) => {
      if (name === "certMeta") certMetaRaw = value;
    });

    bb.on("finish", () => {
      if (!fileReceived || fileChunks.length === 0) {
        reject(new Error("Missing or invalid file (signed PDF)"));
        return;
      }
      resolve({
        fileBuffer: Buffer.concat(fileChunks),
        fileMimeType,
        certMetaRaw,
      });
    });

    bb.on("error", (err) => reject(err));

    const body = request.body;
    if (!body) {
      reject(new Error("Request body is empty"));
      return;
    }
    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
  });
}

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

    let fileBuffer: Buffer;
    let fileMimeType: string;
    let certMetaRaw: string | null;

    try {
      const parsed = await parseMultipart(request);
      fileBuffer = parsed.fileBuffer;
      fileMimeType = parsed.fileMimeType;
      certMetaRaw = parsed.certMetaRaw;
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Failed to parse multipart";
      console.error("POST /api/jobs/[jobId]/complete parse error:", parseErr);
      return NextResponse.json({ error: msg }, { status: 400 });
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

    if (fileMimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 }
      );
    }

    const buffer = fileBuffer;
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

    revalidatePath("/d/" + job.document.publicId);

    await advanceContractIfNeeded(jobId, job.document.publicId);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const signedPublicUrl = `${appUrl}/d/${job.document.publicId}`;

    let signedDownloadUrl: string | null = null;
    try {
      signedDownloadUrl = await storage.getPresignedUrl(
        outputVersion.storageKey,
        3600
      );
    } catch (e) {
      console.warn("Could not generate signedDownloadUrl:", e);
    }

    return NextResponse.json({
      signedPublicUrl,
      signedDownloadUrl,
      publicId: job.document.publicId,
      versionNumber: nextVersion,
    });
  } catch (err) {
    console.error("POST /api/jobs/[jobId]/complete error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function advanceContractIfNeeded(jobId: string, publicId: string) {
  try {
    const contractSigner = await prisma.contractSigner.findUnique({
      where: { signingJobId: jobId },
      include: {
        contract: {
          include: {
            signers: { orderBy: { order: "asc" } },
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!contractSigner) return;

    await prisma.contractSigner.update({
      where: { id: contractSigner.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const { contract } = contractSigner;
    const nextSigner = contract.signers.find(
      (s) => s.order > contractSigner.order && s.status === "PENDING"
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (nextSigner) {
      const signingUrl = `${appUrl}/contract/${contract.id}?token=${nextSigner.token}`;

      try {
        await sendSigningInvitation(
          nextSigner.email,
          nextSigner.name,
          contract.title,
          signingUrl,
          contract.user.name ?? undefined
        );
      } catch (emailErr) {
        console.error("Failed to send next signer invitation:", emailErr);
      }

      await prisma.contractSigner.update({
        where: { id: nextSigner.id },
        data: { status: "INVITED", invitedAt: new Date() },
      });
    } else {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      const viewUrl = `${appUrl}/contract/${contract.id}`;
      const allSigners = contract.signers;
      const ownerEmail = contract.user.email;

      const recipients = [
        ...allSigners.map((s) => ({ email: s.email, name: s.name })),
      ];
      if (ownerEmail && !recipients.find((r) => r.email === ownerEmail)) {
        recipients.push({ email: ownerEmail, name: contract.user.name ?? "Chủ hợp đồng" });
      }

      for (const r of recipients) {
        try {
          await sendContractCompleted(
            r.email,
            r.name,
            contract.title,
            viewUrl
          );
        } catch (emailErr) {
          console.error(`Failed to send completion email to ${r.email}:`, emailErr);
        }
      }

      revalidatePath(`/contract/${contract.id}`);
    }
  } catch (err) {
    console.error("advanceContractIfNeeded error:", err);
  }
}
