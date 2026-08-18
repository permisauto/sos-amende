import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { Resend as ResendClient } from "resend";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const resend = process.env.AUTH_RESEND_KEY
  ? new ResendClient(process.env.AUTH_RESEND_KEY)
  : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      from: "SOS Amende <onboarding@resend.dev>",
      apiKey: process.env.AUTH_RESEND_KEY,
      sendVerificationRequest: async ({ identifier, url }) => {
        if (!resend) {
          // Mode dev (E2E) : le lien est écrit dans un fichier par email au
          // lieu d'être envoyé — jamais activé hors environnement de dev.
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
          from: "SOS Amende <onboarding@resend.dev>",
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
