import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verifyLogin } from "@/lib/admin/login";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

const credentials = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });

/**
 * Staff authentication (Auth.js v5). Email + password (bcrypt) against the User table.
 * Sessions are signed JWT cookies; the role is embedded and re-checked on every admin request.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/admin/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const { headers } = await import("next/headers");
        const h = await headers().catch(() => null);
        const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? null;
        const r = await verifyLogin(parsed.data.email, parsed.data.password, ip);
        if (!r.ok) return null;
        return { id: r.user.id, email: r.user.email, name: r.user.name, role: r.user.role, pwdAt: r.user.passwordChangedAt.getTime() } as never;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role: Role }).role;
        token.pwdAt = (user as { pwdAt?: number }).pwdAt ?? Date.now();
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      (session as unknown as { pwdAt?: number }).pwdAt = token.pwdAt as number;
      return session;
    },
  },
});
