import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendSigningInvitation } from "@/lib/email";

const SignerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  order: z.number().int().positive(),
  templateId: z.string().optional().default("classic"),
  placement: z.object({
    page: z.union([z.literal("LAST"), z.number().int().positive()]),
    rectPct: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    }),
  }),
});

const CreateContractSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1).max(500),
  message: z.string().max(2000).optional(),
  expiresInDays: z.number().int().min(1).max(90).default(7),
  signers: z.array(SignerSchema).min(1).max(10),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = CreateContractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { documentId, title, message, expiresInDays, signers } = parsed.data;

    const document = await prisma.document.findFirst({
      where: {
        OR: [{ id: documentId }, { publicId: documentId }],
        userId: session.user.id,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found or not owned by you" },
        { status: 404 }
      );
    }

    const orders = signers.map((s) => s.order);
    if (new Set(orders).size !== orders.length) {
      return NextResponse.json(
        { error: "Signer orders must be unique" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000
    );

    const contract = await prisma.contract.create({
      data: {
        documentId: document.id,
        userId: session.user.id,
        title,
        message,
        status: "PENDING",
        expiresAt,
        signers: {
          create: signers
            .sort((a, b) => a.order - b.order)
            .map((s) => ({
              email: s.email,
              name: s.name,
              order: s.order,
              token: randomBytes(24).toString("hex"),
              placementJson: JSON.stringify(s.placement),
              templateId: s.templateId ?? "classic",
              status: "PENDING",
            })),
        },
      },
      include: { signers: { orderBy: { order: "asc" } } },
    });

    const firstSigner = contract.signers[0];
    if (firstSigner) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const signingUrl = `${appUrl}/contract/${contract.id}?token=${firstSigner.token}`;

      try {
        await sendSigningInvitation(
          firstSigner.email,
          firstSigner.name,
          title,
          signingUrl,
          session.user.name ?? undefined
        );
      } catch (emailErr) {
        console.error("Failed to send signing invitation:", emailErr);
      }

      await prisma.contractSigner.update({
        where: { id: firstSigner.id },
        data: { status: "INVITED", invitedAt: new Date() },
      });

      await prisma.contract.update({
        where: { id: contract.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    return NextResponse.json({
      contractId: contract.id,
      title: contract.title,
      status: contract.status,
      expiresAt: contract.expiresAt.toISOString(),
      signers: contract.signers.map((s) => ({
        id: s.id,
        email: s.email,
        name: s.name,
        order: s.order,
        status: s.status,
      })),
    });
  } catch (err) {
    console.error("POST /api/contracts error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const contracts = await prisma.contract.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        signers: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            email: true,
            name: true,
            order: true,
            status: true,
          },
        },
        document: {
          select: { publicId: true, title: true },
        },
      },
    });

    return NextResponse.json({
      contracts: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        completedAt: c.completedAt?.toISOString() ?? null,
        document: c.document,
        signers: c.signers,
        signedCount: c.signers.filter((s) => s.status === "COMPLETED").length,
        totalSigners: c.signers.length,
      })),
    });
  } catch (err) {
    console.error("GET /api/contracts error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
