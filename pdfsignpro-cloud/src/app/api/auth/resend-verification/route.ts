import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { sendEmailVerification } from "@/lib/email";

const ResendSchema = z.object({
  email: z.email().max(320),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ResendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        passwordHash: true,
      },
    });

    // Do not leak account existence details.
    if (!user || !user.passwordHash) {
      return NextResponse.json({ ok: true });
    }
    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const { rawToken } = await createEmailVerificationToken(user.id);
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
    await sendEmailVerification(email, user.name, verifyUrl);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/resend-verification error:", err);
    return NextResponse.json(
      { error: "Không thể gửi lại email xác thực" },
      { status: 500 }
    );
  }
}

