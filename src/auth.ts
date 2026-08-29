import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const cleanResendKey = process.env.AUTH_RESEND_KEY?.replace(/^\uFEFF/, "").trim();
const resend = cleanResendKey ? new ResendClient(cleanResendKey) : null;

// Expéditeur des e-mails (Resend). Configurable via EMAIL_FROM : en prod, il
// doit être un domaine vérifié sur Resend, sinon Resend refuse l'envoi (le
// domaine sandbox onboarding@resend.dev n'expédie qu'aux adresses testées).
const EMAIL_FROM = process.env.EMAIL_FROM ?? "SOS Amende <onboarding@resend.dev>";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      from: EMAIL_FROM,
      apiKey: cleanResendKey,
      sendVerificationRequest: async ({ identifier, url }) => {
        if (!resend) {
          // Mode dev (E2E) : le lien est écrit dans un fichier par email au
          // lieu d'être envoyé. En production, l'absence de clé Resend est une
          // erreur de configuration — on refuse d'expédier un magic-link, sauf
          // opt-in explicite AUTH_DEV_FILE=1 (réservé aux E2E en build prod).
          const devFile = process.env.AUTH_DEV_FILE === "1";
          if (process.env.NODE_ENV === "production" && !devFile) {
            throw new Error(
              "AUTH_RESEND_KEY manquante : impossible d'envoyer le lien de connexion en production.",
            );
          }
          const dir = path.join(process.cwd(), "node_modules", ".cache");
          await mkdir(dir, { recursive: true });
          const safe = identifier.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
          await writeFile(
            path.join(dir, `dev-magic-link-${safe}.txt`),
            JSON.stringify({ identifier, url }),
            "utf8",
          );
          return;
        }
        await resend.emails.send({
          from: EMAIL_FROM,
          to: identifier,
          subject: "Connexion à SOS Amende",
          html: `
            <p>Bonjour,</p>
            <p>Cliquez sur le lien ci-dessous pour vous connecter à votre espace SOS Amende :</p>
            <p><a href="${url}">${url}</a></p>
            <p>Ce lien est valable 24 heures.</p>
            <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
          `,
        });
      },
    }),
  ],
});
