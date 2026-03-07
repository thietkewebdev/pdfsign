import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params;

    const document = await prisma.document.findUnique({
      where: { publicId },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const currentVersion = document.versions[0];
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
    });
  } catch (err) {
    console.error("GET /api/documents/[publicId] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
