import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getPrismaClient } from "@/lib/db/prisma";
import { isUserRole } from "@/lib/permissions/roles";
import { authenticateCredentials } from "@/server/auth/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Kata sandi",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Kata sandi", type: "password" },
      },
      async authorize(credentials) {
        return authenticateCredentials(credentials, (email) =>
          getPrismaClient().user.findUnique({
            where: { email },
            include: { role: true },
          }),
        );
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: process.env.NODE_ENV === "production",
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  jwt: { maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      try { await getPrismaClient().auditLog.create({ data: { userId: user.id, action: "LOGIN", entity: "User", entityId: user.id } }); }
      catch (error) { console.error("Login audit could not be recorded.", error); }
    },
    async signOut(message) {
      const userId = message.token?.sub;
      if (!userId) return;
      try { await getPrismaClient().auditLog.create({ data: { userId, action: "LOGOUT", entity: "User", entityId: userId } }); }
      catch (error) { console.error("Logout audit could not be recorded.", error); }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (user?.role && isUserRole(user.role)) token.role = user.role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = isUserRole(token.role) ? token.role : null;
      }
      return session;
    },
  },
};
