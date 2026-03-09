import { NextResponse } from "next/server";
import { getStorageDriver } from "@/storage";

const PRESIGN_EXPIRES = 10 * 60; // 10 minutes

const DEFAULT_OFFLINE_R2_KEY = "SignOffline/PDFSignPro_Setup.exe";

export async function GET() {
  const key =
    process.env.OFFLINE_R2_KEY?.trim() || DEFAULT_OFFLINE_R2_KEY;

  try {
    const storage = getStorageDriver();
    const exists = storage.exists && (await storage.exists(key));
    if (!exists) {
      return NextResponse.json(
        {
          error: "Offline app not found",
          hint: `Upload PDFSignPro_Setup.exe to R2 at key "${key}" (OFFLINE_R2_KEY)`,
        },
        { status: 404 }
      );
    }
    const presignedUrl = await storage.getPresignedUrl(key, PRESIGN_EXPIRES);
    const res = NextResponse.redirect(presignedUrl, 302);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("GET /api/download/offline error:", err);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
