import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent, recordAdminAuditLog } from "@/lib/admin-events";
import { prisma } from "@/lib/prisma";
import { parseBytesRange } from "@/lib/http-range";
import { getStorageDriver } from "@/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

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
      return NextResponse.json({ error: "No version found" }, { status: 404 });
    }

    void recordAdminAuditLog({
      actorUserId: session.user.id,
      action: "view_document_pdf",
      resource: "document",
      resourceId: document.id,
      metadata: { publicId, version: currentVersion.version },
    });
    void recordAdminAnalyticsEvent({
      eventType: "admin.api.document.file.view",
      path: `/api/admin/documents/${publicId}/file`,
      method: "GET",
      actorUserId: session.user.id,
      metadata: { publicId, version: currentVersion.version },
    });

    const storage = getStorageDriver();
    const getBuffer = storage.getBuffer;
    const getBufferRange = storage.getBufferRange;
    if (!getBuffer) {
      return NextResponse.json(
        { error: "Storage driver does not support direct read" },
        { status: 500 }
      );
    }

    const totalSize =
      typeof currentVersion.sizeBytes === "number" && currentVersion.sizeBytes > 0
        ? currentVersion.sizeBytes
        : null;

    const rangeHeader = request.headers.get("range");

    if (totalSize != null && rangeHeader && getBufferRange) {
      const trimmed = rangeHeader.trim();
      if (trimmed.startsWith("bytes=")) {
        const parsed = parseBytesRange(trimmed, totalSize);
        if (parsed) {
          const { start, end } = parsed;
          const slice = await getBufferRange(currentVersion.storageKey, start, end);
          return new NextResponse(new Uint8Array(slice), {
            status: 206,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(slice.length),
              "Content-Range": `bytes ${start}-${end}/${totalSize}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, no-store",
            },
          });
        }
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${totalSize}`,
          },
        });
      }
    }

    const buffer = await getBuffer(currentVersion.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/admin/documents/[publicId]/file error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
