import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { SuppressionCompte } from "./suppression-compte";

export default async function ParametresPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Vos données sont hébergées dans l&apos;Union européenne. Vous disposez
        de droits d&apos;accès, de portabilité et d&apos;effacement (RGPD).
      </p>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Informations du compte
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Nom</dt>
            <dd className="font-medium">{user.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Rôle</dt>
            <dd className="font-medium">{user.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Crédits restants</dt>
            <dd className="font-medium">{user.credits}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Exporter mes données
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Téléchargez l&apos;ensemble de vos données personnelles au format
          JSON (portabilité, RGPD art. 20).
        </p>
        <a
          href="/api/rgpd/export"
          className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Télécharger mes données (JSON)
        </a>
      </div>

      <div className="mt-6 rounded-2xl border border-red-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-600">
          Zone de danger
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          La suppression de votre compte efface définitivement vos dossiers,
          vos fichiers et vos données personnelles (RGPD art. 17). Cette action
          est irréversible.
        </p>
        <SuppressionCompte />
      </div>

      <p className="mt-8 text-sm text-zinc-500">
        Pour toute question relative à vos données :{" "}
        <Link href="/confidentialite" className="text-emerald-700 hover:underline">
          notre politique de confidentialité
        </Link>
        .
      </p>
    </div>
  );
}