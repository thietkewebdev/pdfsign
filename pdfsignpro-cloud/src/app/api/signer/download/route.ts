import { NextResponse } from "next/server";
import { getStorageDriver } from "@/storage";

const PRESIGN_EXPIRES = 10 * 60; // 10 minutes

export async function GET() {
  const key = process.env.SIGNER_R2_KEY;
  if (!key?.trim()) {
    return NextResponse.json(
      {
        error: "Signer download not configured",
        hint: "Set SIGNER_R2_KEY in environment (e.g. signer/PDFSignProSigner.exe)",
      },
      { status: 500 }
    );
  }

  try {
    const storage = getStorageDriver();
    const exists = storage.exists && (await storage.exists(key));
    if (!exists) {
      return NextResponse.json(
        {
          error: "Signer file not found",
          hint: `Upload PDFSignProSigner.exe to R2 at key "${key}" (SIGNER_R2_KEY)`,
        },
        { status: 404 }
      );
    }
    const presignedUrl = await storage.getPresignedUrl(key, PRESIGN_EXPIRES);
    const res = NextResponse.redirect(presignedUrl, 302);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("GET /api/signer/download error:", err);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
