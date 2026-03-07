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
        versions: { orderBy: { version: "desc" }, take: 1 },
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
