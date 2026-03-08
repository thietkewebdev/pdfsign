import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";

/** Sanitize filename for Content-Disposition: remove unsafe chars, limit length */
function sanitizeFilename(title: string): string {
  const base = (title || "document")
    .replace(/\.pdf$/i, "")
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return base || "document";
}

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
    const getBuffer = storage.getBuffer;
    if (!getBuffer) {
      return NextResponse.json(
        { error: "Storage driver does not support direct read" },
        { status: 500 }
      );
    }

    const buffer = await getBuffer(currentVersion.storageKey);
    const safeTitle = sanitizeFilename(document.title ?? "document");
    const filename = `${safeTitle}-v${currentVersion.version}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("GET /api/documents/[publicId]/download error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
