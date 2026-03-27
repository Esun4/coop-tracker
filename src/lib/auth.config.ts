import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config — no Prisma or Node.js-only imports.
// Used by middleware for JWT verification.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
};
