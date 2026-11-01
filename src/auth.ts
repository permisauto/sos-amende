import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { Resend as ResendClient } from "resend";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { verifyPassword } from "@/lib/password";
import crypto from "crypto";

const cleanResendKey = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
const resend = cleanResendKey ? new ResendClient(cleanResendKey) : null;

// Expéditeur des e-mails (Resend). Configurable via EMAIL_FROM : en prod, il
// doit être un domaine vérifié sur Resend, sinon Resend refuse l'envoi (le
// domaine sandbox onboarding@resend.dev n'expédie qu'aux adresses testées).
const EMAIL_FROM = (process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>").replace(/\uFEFF/g, "").trim();

// Base de données des jetons de vérification d'email
const EMAIL_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function createEmailVerificationToken(email: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + EMAIL_TOKEN_EXPIRY_MS);
  
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });
  
  return token;
}

export async function verifyEmailToken(email: string, token: string) {
  const record = await prisma.verificationToken.findFirst({
    where: {
      identifier: email,
      token,
      expires: { gt: new Date() },
    },
  });
  
  if (!record) return false;
  
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } });
  return true;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    // Connexion e-mail + mot de passe (comptes internes juristes/administrateurs
    // provisionnés par le super admin). authorize vérifie passwordHash dans la
    // base (scrypt). Rôle injecté dans le jeton par le callback jwt.
    Credentials({
      name: "Mot de passe",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials) return null;
        const email = String(credentials.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    Resend({
      from: EMAIL_FROM,
      apiKey: cleanResendKey,
      sendVerificationRequest: async ({ identifier, url }) => {
        const email = identifier.trim().toLowerCase();
        const token = await createEmailVerificationToken(email);
        
        if (!resend) {
          // Mode dev (E2E) : le lien est écrit dans un fichier par email au
          // lieu d'être envoyé. En production, l'absence de clé Resend est une
          // erreur de configuration — on refuse d'envoyer un magic-link, sauf
          // opt-in E2E explicite (AUTH_DEV_FILE=1 ET ANTAI_MOCK=1, réservé aux
          // suites Playwright locales) : un AUTH_DEV_FILE seul ne suffit jamais
          // sur une vraie production/Vercel.
          const e2eOptIn = process.env.AUTH_DEV_FILE === "1" && process.env.ANTAI_MOCK === "1";
          if (process.env.NODE_ENV === "production" && !e2eOptIn) {
            throw new Error(
              "AUTH_RESEND_KEY manquante : impossible d'envoyer le lien de connexion en production.",
            );
          }
          const dir = path.join(process.cwd(), "node_modules", ".cache");
          await mkdir(dir, { recursive: true });
          const safe = email.replace(/[^a-z0-9.-]/g, "_");
          await writeFile(
            path.join(dir, `dev-magic-link-${safe}.txt`),
            JSON.stringify({ identifier, url, token }),
            "utf8",
          );
          return;
        }

        const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/resend?token=${token}&email=${encodeURIComponent(email)}`;
        await resend.emails.send({
          from: EMAIL_FROM,
          to: identifier,
          subject: "Vérifiez votre adresse email - SOS Amende",
          html: `
            <p>Bonjour,</p>
            <p>Merci de vous être inscrit à SOS Amende. Veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :</p>
            <p><a href="${verificationUrl}">${verificationUrl}</a></p>
            <p>Ce lien est valable 24 heures.</p>
            <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
          `,
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub,
          role: token.role,
          email: token.email,
          name: token.name,
        },
      };
    },
  },
});
