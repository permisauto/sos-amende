import type { Metadata } from "next";
import { AccesProClient } from "./acces-pro-client";

export const metadata: Metadata = { title: "Accès juriste / admin — réservé" };

export default function AccesProPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold">Accès réservé — Juriste / Admin</h1>
      <p className="mt-2 text-sm text-zinc-600">Accès provisoire pour vérification. Choisissez votre profil — connexion instantanée sans email.</p>
      <div className="mt-8">
        <AccesProClient />
      </div>
      <p className="mt-6 text-center text-xs text-zinc-400">Accès discret en bas de page — réservé au personnel habilité.</p>
    </div>
  );
}
