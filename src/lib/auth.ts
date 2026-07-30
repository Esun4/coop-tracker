import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { CustomPrismaAdapter } from "@/lib/auth-adapter";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { authorizeCredentials } from "@/lib/credentials-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: CustomPrismaAdapter(),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Lives in its own module so it can be tested without booting the
      // adapter and every provider — see src/lib/credentials-auth.ts.
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        // Store encrypted Google tokens for Gmail API access
        if (account.access_token) {
          const user = await prisma.user.update({
            where: { email: token.email! },
            data: {
              googleAccessToken: encrypt(account.access_token),
              googleRefreshToken: account.refresh_token
                ? encrypt(account.refresh_token)
                : undefined,
            },
            select: { id: true },
          });
          token.userId = user.id;
          return token;
        }
      }

      // Embed userId in token to avoid a DB query on every JWT refresh
      if (!token.userId && token.email) {
        const user = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        });
        if (user) token.userId = user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
