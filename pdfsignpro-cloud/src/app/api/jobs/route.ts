import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateJobToken, hashJobToken } from "@/lib/job-token";
import { generateClaimCode, hashClaimCode } from "@/lib/claim-code";
import { base64urlEncode } from "@/lib/base64url";
import { getStorageDriver } from "@/storage";
import { checkQuota } from "@/lib/usage";

const rectPctSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const CreateJobSchema = z.object({
  documentId: z.string().min(1),
  templateId: z.string().optional(),
  sealImage: z.string().optional(),
  placement: z.object({
    page: z.union([z.literal("LAST"), z.number().int().positive()]),
    rectPct: rectPctSchema,
  }).or(z.object({
    page: z.number().int().positive(),
    xPct: z.number().min(0).max(1),
    yPct: z.number().min(0).max(1),
    wPct: z.number().min(0).max(1),
    hPct: z.number().min(0).max(1),
  })),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { documentId, templateId, sealImage, placement: rawPlacement } = parsed.data;

    // Normalize placement to spec format: { page, rectPct: { x, y, w, h } }
    const placement = "rectPct" in rawPlacement
      ? rawPlacement
      : {
          page: rawPlacement.page,
          rectPct: {
            x: rawPlacement.xPct,
            y: rawPlacement.yPct,
            w: rawPlacement.wPct,
            h: rawPlacement.hPct,
          },
        };

    const document = await prisma.document.findFirst({
      where: {
        OR: [{ id: documentId }, { publicId: documentId }],
      },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const currentVersion = document.versions[0];
    if (!currentVersion) {
      return NextResponse.json(
        { error: "No version found for document" },
        { status: 404 }
      );
    }

    if (document.userId) {
      const quota = await checkQuota(document.userId);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: "Bạn đã đạt giới hạn 50 file ký/tháng. Vui lòng nâng cấp gói hoặc chờ reset tháng sau.",
            code: "QUOTA_EXCEEDED",
            used: quota.used,
            limit: quota.limit,
          },
          { status: 402 }
        );
      }
    }

    const jobToken = generateJobToken();
    const jobTokenHash = hashJobToken(jobToken);
    const claimCode = generateClaimCode();
    const claimCodeHash = hashClaimCode(claimCode);
    const jobId = `job_${randomBytes(8).toString("hex")}`;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    let sealImageKey: string | null = null;
    if (templateId === "seal" && sealImage) {
      const match = sealImage.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
      if (match) {
        const ext = match[1].toLowerCase().replace("jpeg", "jpg");
        const buf = Buffer.from(match[2], "base64");
        const MAX_SEAL_SIZE = 2 * 1024 * 1024;
        if (buf.length <= MAX_SEAL_SIZE) {
          sealImageKey = `documents/${document.publicId}/seal_${jobId}.${ext}`;
          const storage = getStorageDriver();
          await storage.upload(sealImageKey, buf, `image/${ext === "jpg" ? "jpeg" : ext}`);
        }
      }
    }

    await prisma.signingJob.create({
      data: {
        id: jobId,
        documentVersionId: currentVersion.id,
        documentId: document.id,
        jobTokenHash,
        jobToken,
        claimCodeHash,
        status: "CREATED",
        placementJson: JSON.stringify(placement),
        sealImageKey,
        expiresAt,
      },
    });

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const hostname = new URL(apiBaseUrl).hostname;
    const payload: Record<string, string> = { j: jobId, c: claimCode, h: hostname };
    if (templateId) payload.t = templateId;
    const deepLink = `pdfsignpro://sign?p=${base64urlEncode(payload)}`;

    return NextResponse.json({
      jobId,
      deepLink,
      placement,
      documentId: document.id,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("POST /api/jobs error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
