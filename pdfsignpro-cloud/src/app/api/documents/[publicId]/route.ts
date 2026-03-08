import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params;
    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get("v");

    const document = await prisma.document.findUnique({
      where: { publicId },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    let currentVersion = document.versions[0];
    if (versionParam != null && versionParam !== "") {
      const v = parseInt(versionParam, 10);
      if (!Number.isNaN(v)) {
        const specific = await prisma.documentVersion.findFirst({
          where: { documentId: document.id, version: v },
        });
        if (specific) currentVersion = specific;
      }
    }
    if (!currentVersion) {
      return NextResponse.json(
        { error: "No version found" },
        { status: 404 }
      );
    }

    const storage = getStorageDriver();
    const presignedUrl = await storage.getPresignedUrl(
      currentVersion.storageKey,
      3600
    );

    const viewUrl = `/api/documents/${document.publicId}/file?v=${currentVersion.version}`;

    // Find the completed job that produced this version (for signInfo)
    const signJob = await prisma.signingJob.findFirst({
      where: {
        documentId: document.id,
        status: "COMPLETED",
        outputVersionId: currentVersion.id,
      },
      orderBy: { completedAt: "desc" },
    });

    let signInfo: {
      signedBy?: string;
      issuerCN?: string;
      serial?: string;
      signingTime?: string;
    } | null = null;
    if (signJob?.certMetaJson) {
      try {
        const meta = JSON.parse(signJob.certMetaJson) as Record<string, unknown>;
        const o = typeof meta.subjectO === "string" ? meta.subjectO : "";
        const cn = typeof meta.subjectCN === "string" ? meta.subjectCN : "";
        const signedBy = [o, cn].filter(Boolean).join(" / ") || undefined;
        const issuerCN =
          typeof meta.issuerCN === "string" ? meta.issuerCN : undefined;
        const serial =
          typeof meta.serial === "string" ? meta.serial : undefined;
        const signingTime =
          typeof meta.signingTime === "string" ? meta.signingTime : undefined;
        if (signedBy || issuerCN || serial || signingTime) {
          signInfo = { signedBy, issuerCN, serial, signingTime };
        }
      } catch {
        // ignore parse errors
      }
    }

    return NextResponse.json({
      document: {
        id: document.id,
        publicId: document.publicId,
        title: document.title,
        status: document.status,
        createdAt: document.createdAt.toISOString(),
      },
      currentVersion: {
        version: currentVersion.version,
        sizeBytes: currentVersion.sizeBytes,
        createdAt: currentVersion.createdAt.toISOString(),
      },
      presignedUrl,
      viewUrl,
      signInfo,
    });
  } catch (err) {
    console.error("GET /api/documents/[publicId] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
