import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminSession, unauthorizedAdminResponse } from "@/lib/admin";
import { recordAdminAnalyticsEvent, recordAdminAuditLog } from "@/lib/admin-events";

const UpdateUserSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["verifyEmail", "lock", "unlock", "setPlan"]),
  plan: z.string().trim().min(1).max(50).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    const verified = request.nextUrl.searchParams.get("verified");
    const disabled = request.nextUrl.searchParams.get("disabled");
    const plan = request.nextUrl.searchParams.get("plan")?.trim() ?? "";
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? "20"))
    );
    const skip = (page - 1) * pageSize;

    const where = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(verified === "true"
        ? { emailVerified: { not: null as Date | null } }
        : verified === "false"
          ? { emailVerified: null as Date | null }
          : {}),
      ...(disabled === "true"
        ? { isDisabled: true }
        : disabled === "false"
          ? { isDisabled: false }
          : {}),
      ...(plan ? { plan } : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          emailVerified: true,
          isDisabled: true,
          plan: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              documents: true,
              contracts: true,
            },
          },
          accounts: {
            select: {
              provider: true,
            },
          },
        },
      }),
    ]);
    await recordAdminAnalyticsEvent({
      eventType: "admin.api.users.view",
      actorUserId: session.user.id,
      metadata: { page, pageSize, hasSearch: Boolean(search) },
    });

    return NextResponse.json({
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        emailVerified: u.emailVerified?.toISOString() ?? null,
        isDisabled: u.isDisabled,
        plan: u.plan,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        providers: Array.from(new Set(u.accounts.map((a) => a.provider))),
        counts: {
          documents: u._count.documents,
          contracts: u._count.contracts,
        },
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!isAdminSession(session)) return unauthorizedAdminResponse();

    const body = await request.json();
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userId, action, plan } = parsed.data;
    const updateData =
      action === "verifyEmail"
        ? { emailVerified: new Date() }
        : action === "lock"
          ? { isDisabled: true }
          : action === "unlock"
            ? { isDisabled: false }
            : action === "setPlan"
              ? plan
                ? { plan }
                : null
              : null;

    if (!updateData) {
      return NextResponse.json(
        { error: "plan is required for setPlan action" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, plan: true, isDisabled: true },
    });

    await Promise.all([
      recordAdminAuditLog({
        actorUserId: session.user.id,
        action,
        resource: "user",
        resourceId: userId,
        detail: `Admin ${action} user ${updatedUser.email ?? updatedUser.id}`,
        metadata: action === "setPlan" ? { plan: updatedUser.plan } : undefined,
      }),
      recordAdminAnalyticsEvent({
        eventType: `admin.user.${action}`,
        actorUserId: session.user.id,
        subjectUserId: userId,
        metadata:
          action === "setPlan"
            ? { plan: updatedUser.plan }
            : { isDisabled: updatedUser.isDisabled },
      }),
    ]);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("PATCH /api/admin/users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
