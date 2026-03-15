import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { sendEmailVerification } from "@/lib/email";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(320),
  password: z.string().min(8).max(72),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, emailVerified: true, name: true },
    });
    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: "Email đã được đăng ký" },
        { status: 409 }
      );
    }

    const passwordHash = await hash(parsed.data.password, 12);
    let userId: string;
    let userName: string | null = parsed.data.name;

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          passwordHash,
          emailVerified: existing.emailVerified ? existing.emailVerified : null,
        },
        select: { id: true, name: true, emailVerified: true },
      });
      userId = updated.id;
      userName = updated.name;
    } else {
      const created = await prisma.user.create({
        data: {
          name: parsed.data.name,
          email,
          passwordHash,
        },
        select: { id: true, name: true },
      });
      userId = created.id;
      userName = created.name;
    }

    const shouldVerify = !existing?.emailVerified;
    if (shouldVerify) {
      const { rawToken } = await createEmailVerificationToken(userId);
      const baseUrl =
        process.env.NEXTAUTH_URL ??
        process.env.NEXT_PUBLIC_APP_URL ??
        "http://localhost:3000";
      const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
      await sendEmailVerification(email, userName, verifyUrl);
    }

    return NextResponse.json({ ok: true, requiresVerification: shouldVerify });
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
