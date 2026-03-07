import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateJobToken, hashJobToken } from "@/lib/job-token";

const rectPctSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const CreateJobSchema = z.object({
  documentId: z.string().min(1),
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

    const { documentId, placement: rawPlacement } = parsed.data;

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

    const jobToken = generateJobToken();
    const jobTokenHash = hashJobToken(jobToken);
    const jobId = `job_${randomBytes(8).toString("hex")}`;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.signingJob.create({
      data: {
        id: jobId,
        documentVersionId: currentVersion.id,
        documentId: document.id,
        jobTokenHash,
        status: "CREATED",
        placementJson: JSON.stringify(placement),
        expiresAt,
      },
    });

    const apiBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const deepLink = `pdfsignpro://sign?jobId=${jobId}&token=${jobToken}&apiBaseUrl=${encodeURIComponent(apiBaseUrl)}`;

    return NextResponse.json({
      jobId,
      jobToken,
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
