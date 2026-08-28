import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SOS Amende — Contester vos amendes et défendre votre permis",
    template: "%s · SOS Amende",
  },
  description:
    "Contestez vos amendes routières et votre suspension de permis en quelques clics : analyse des motifs, courrier de recours prêt à envoyer, suivi des délais.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  alternates: { canonical: "/" },
  openGraph: {
    title: "SOS Amende — Contester vos amendes",
    description: "Analyse des motifs juridiques, lettre de recours validée par un juriste, suivi LRAR.",
    locale: "fr_FR",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 rounded bg-zinc-900 px-4 py-2 text-white">
          Aller au contenu principal
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
