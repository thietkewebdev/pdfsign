import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { isAdminEmail } from "./admin";

const CredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    Google,
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
            emailVerified: true,
            isDisabled: true,
          },
        });
        if (!user?.passwordHash || !user.email) return null;
        if (!user.emailVerified) return null;
        if (user.isDisabled) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      const email = user?.email ?? token.email;
      token.isAdmin = isAdminEmail(email);
      return token;
    },
    session({ session, token, user }) {
      const idFromToken = typeof token.id === "string" ? token.id : undefined;
      const idFromUser = user?.id;
      if (idFromToken || idFromUser) {
        session.user.id = (idFromToken ?? idFromUser)!;
      }
      session.user.isAdmin = token.isAdmin === true;
      return session;
    },
  },
});
