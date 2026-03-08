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
    const getBuffer = storage.getBuffer;
    if (!getBuffer) {
      return NextResponse.json(
        { error: "Storage driver does not support direct read" },
        { status: 500 }
      );
    }

    const buffer = await getBuffer(currentVersion.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("GET /api/documents/[publicId]/file error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
