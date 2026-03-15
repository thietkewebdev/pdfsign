import { NextResponse } from "next/server";
import { z } from "zod";
<<<<<<< HEAD
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const bodySchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  name: z.string().min(1, "Vui lòng nhập tên").max(100),
=======
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(320),
  password: z.string().min(8).max(72),
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
<<<<<<< HEAD
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const { email, password, name } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email này đã được đăng ký" },
        { status: 409 }
      );
    }
    const passwordHash = hashPassword(password);
    await prisma.user.create({
      data: {
        email,
        name: name.trim(),
        passwordHash,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Register error:", e);
    return NextResponse.json(
      { error: "Không thể đăng ký. Vui lòng thử lại." },
=======
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
      select: { id: true, passwordHash: true },
    });
    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: "Email đã được đăng ký" },
        { status: 409 }
      );
    }

    const passwordHash = await hash(parsed.data.password, 12);

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          passwordHash,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          name: parsed.data.name,
          email,
          passwordHash,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
>>>>>>> 498c8d4 (feat: add email/password signup and login flow)
      { status: 500 }
    );
  }
}
