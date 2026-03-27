import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { CustomPrismaAdapter } from "@/lib/auth-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { encrypt } from "@/lib/crypto";

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
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user?.hashedPassword) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.hashedPassword
        );

        if (!isValid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
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
