import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verification",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      if (isOnDashboard && !isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      const tokenUser = token as { role?: string };
      if (user) {
        tokenUser.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      const tokenUser = token as { sub?: string; role?: string };
      if (tokenUser.sub) session.user.id = tokenUser.sub;
      if (tokenUser.role) session.user.role = tokenUser.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
