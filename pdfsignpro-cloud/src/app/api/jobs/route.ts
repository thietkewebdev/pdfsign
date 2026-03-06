import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";

const CreateJobSchema = z.object({
  fileId: z.string().min(1),
  placement: z.object({
    page: z.number().int().positive(),
    xPct: z.number().min(0).max(1),
    yPct: z.number().min(0).max(1),
    wPct: z.number().min(0).max(1),
    hPct: z.number().min(0).max(1),
  }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId, placement } = parsed.data;
    const jobId = `job_${randomBytes(8).toString("hex")}`;
    const jobToken = randomBytes(24).toString("hex");
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const deepLink = `pdfsignpro://sign?jobId=${jobId}&token=${jobToken}&apiBaseUrl=${encodeURIComponent(apiBaseUrl)}`;

    return NextResponse.json({
      jobId,
      jobToken,
      deepLink,
      placement,
      fileId,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
