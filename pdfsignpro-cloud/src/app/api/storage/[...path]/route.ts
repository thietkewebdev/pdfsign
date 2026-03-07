import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), ".storage", "uploads");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (process.env.STORAGE_DRIVER !== "local") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    const { path: pathSegments } = await params;
    const key = pathSegments.join("/");
    const fullPath = path.join(UPLOAD_DIR, key);

    if (!fullPath.startsWith(UPLOAD_DIR)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = await fs.readFile(fullPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
