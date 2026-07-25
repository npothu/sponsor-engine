import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config shared by middleware.ts and auth.ts.
 *
 * Deliberately has no providers - Credentials needs bcrypt + the lib/data.ts
 * DB chain, neither of which runs on the Edge runtime middleware executes in.
 * middleware.ts builds its own NextAuth() instance from this config alone (JWT
 * verification only, no DB access needed for that); auth.ts extends this same
 * config with the real Credentials provider for use in route handlers, server
 * components, and server actions (all Node runtime, not Edge).
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "member";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
