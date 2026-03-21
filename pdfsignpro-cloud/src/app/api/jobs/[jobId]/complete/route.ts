import { Readable } from "node:stream";
import busboy from "busboy";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";
import { verifyJobToken } from "@/lib/job-token";
import { sendSigningInvitation, sendContractCompleted } from "@/lib/email";
import { logContractEvent } from "@/lib/contract-events";
import { recordSigningErrorEvent } from "@/lib/admin-events";

const MAX_SIGNED_PDF_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

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
  const routePath = "/api/jobs/[jobId]/complete";
  const track = (errorCode: string) =>
    recordSigningErrorEvent({ errorCode, path: routePath, method: "POST" }).catch(() => undefined);

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

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      void track("INVALID_CONTENT_TYPE");
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data", errorCode: "INVALID_CONTENT_TYPE" },
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
      void track("INVALID_MULTIPART_BODY");
      const msg = parseErr instanceof Error ? parseErr.message : "Failed to parse multipart";
      console.error("POST /api/jobs/[jobId]/complete parse error:", parseErr);
      return NextResponse.json(
        { error: msg, errorCode: "INVALID_MULTIPART_BODY" },
        { status: 400 }
      );
    }

    let certMetaJson: string | null = null;
    if (typeof certMetaRaw === "string" && certMetaRaw.trim()) {
      try {
        JSON.parse(certMetaRaw);
        certMetaJson = certMetaRaw;
      } catch {
        void track("INVALID_CERT_META");
        return NextResponse.json(
          { error: "certMeta must be valid JSON", errorCode: "INVALID_CERT_META" },
          { status: 400 }
        );
      }
    }

    if (fileMimeType !== "application/pdf") {
      void track("INVALID_FILE_TYPE");
      return NextResponse.json(
        { error: "File must be a PDF", errorCode: "INVALID_FILE_TYPE" },
        { status: 400 }
      );
    }

    const buffer = fileBuffer;
    if (buffer.length > MAX_SIGNED_PDF_SIZE_BYTES) {
      void track("FILE_TOO_LARGE");
      return NextResponse.json(
        {
          error: "Signed PDF exceeds server limit (25MB)",
          errorCode: "FILE_TOO_LARGE",
        },
        { status: 413 }
      );
    }

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
    void track("INTERNAL_SERVER_ERROR");
    console.error("POST /api/jobs/[jobId]/complete error:", err);
    return NextResponse.json(
      { error: "Internal server error", errorCode: "INTERNAL_SERVER_ERROR" },
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

    await logContractEvent(
      contractSigner.contractId,
      "SIGNED",
      contractSigner.name,
      `${contractSigner.name} (${contractSigner.email}) đã ký - bên thứ ${contractSigner.order}`
    );

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

      await logContractEvent(
        contract.id,
        "INVITED",
        undefined,
        `Mời ${nextSigner.name} (${nextSigner.email}) - bên thứ ${nextSigner.order}`
      );
    } else {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await logContractEvent(
        contract.id,
        "COMPLETED",
        undefined,
        `Tất cả ${contract.signers.length} bên đã ký thành công`
      );

      const allSigners = contract.signers;
      const ownerEmail = contract.user.email;

      const recipients = allSigners.map((s) => ({
        email: s.email,
        name: s.name,
        viewUrl: `${appUrl}/contract/${contract.id}?token=${s.token}`,
      }));
      if (ownerEmail && !recipients.find((r) => r.email === ownerEmail)) {
        recipients.push({
          email: ownerEmail,
          name: contract.user.name ?? "Chủ hợp đồng",
          viewUrl: `${appUrl}/contract/${contract.id}`,
        });
      }

      for (const r of recipients) {
        try {
          await sendContractCompleted(
            r.email,
            r.name,
            contract.title,
            r.viewUrl
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
