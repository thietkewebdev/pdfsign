import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/storage";

const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional().default("Untitled"),
});

function generatePublicId(): string {
  return randomBytes(12).toString("base64url");
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const titleRaw = formData.get("title");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid file" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "File must be a PDF" },
        { status: 400 }
      );
    }

    const titleResult = CreateDocumentSchema.shape.title.safeParse(
      typeof titleRaw === "string" ? titleRaw : "Untitled"
    );
    const title = titleResult.success ? titleResult.data : "Untitled";

    const buffer = Buffer.from(await file.arrayBuffer());
    const publicId = generatePublicId();
    const storageKey = `documents/${publicId}/v1.pdf`;

    const storage = getStorageDriver();
    await storage.upload(storageKey, buffer, "application/pdf");

    const document = await prisma.document.create({
      data: {
        publicId,
        title: title || file.name || "Untitled",
        status: "ACTIVE",
        versions: {
          create: {
            version: 1,
            storageKey,
            storageDriver: process.env.STORAGE_DRIVER ?? "r2",
            sizeBytes: buffer.length,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const publicUrl = `${appUrl}/d/${document.publicId}`;

    return NextResponse.json({
      documentId: document.id,
      publicId: document.publicId,
      publicUrl,
      title: document.title,
      version: 1,
    });
  } catch (err) {
    console.error("POST /api/documents error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
