import Link from "next/link";
import { DemoScan } from "@/components/demo-scan";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      <section className="grid items-center gap-12 py-24 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Contestation automatisée, légale et encadrée
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Contester vos amendes et votre suspension de permis, simplement.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-600">
            Analysez votre dossier contre les motifs juridiques reconnus, obtenez
            votre courrier de recours prêt à envoyer et suivez vos délais — sans
            vous perdre dans la procédure.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Link
              href="/deposer?type=AMENDE"
              className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Lancer mon analyse
            </Link>
            <Link
              href="/deposer?type=AMENDE"
              className="rounded-full border border-zinc-300 px-6 py-3 font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Déposer ma contravention
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md">
          <DemoScan />
        </div>
      </section>

      <section id="fonctionnement" className="py-20">
        <h2 className="text-center text-3xl font-bold">Comment ça marche</h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Photographiez l'avis",
              text: "Envoyez une photo de votre avis de contravention ou de votre courrier de rétention.",
            },
            {
              step: "2",
              title: "Analysez vos motifs",
              text: "Notre moteur compare votre situation aux motifs juridiques valables en France.",
            },
            {
              step: "3",
              title: "Envoyez & suivez",
              text: "Votre courrier de recours est généré, prêt à poster. On vous rappelle chaque échéance.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-zinc-200 p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">
                {item.step}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="amendes" className="py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Contestation d'amende</h2>
            <p className="mt-4 text-zinc-600">
              Requête en exonération auprès de l'officier du ministère public,
              dans le délai légal de 45 jours. Paiement, cession du véhicule,
              vol ou usurpation de plaque, erreur matérielle… nous identifions
              le fondement le plus solide pour votre dossier.
            </p>
            <Link
              href="/deposer?type=AMENDE"
              className="mt-6 inline-block rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Contester une amende
            </Link>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Délai clé
            </p>
            <p className="mt-2 text-4xl font-bold text-emerald-600">45 jours</p>
            <p className="mt-2 text-sm text-zinc-600">
              pour contester hors forfait, sinon l'amende est majorée. Notre
              système de rappels vous alerte à J-10, J-3 et J-0.
            </p>
          </div>
        </div>
      </section>

      <section id="permis" className="py-20">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div className="order-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 md:order-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Procédure d'urgence
            </p>
            <p className="mt-2 text-4xl font-bold text-emerald-600">
              48 à 72 h
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              pour agir en référé-suspension devant le tribunal administratif
              avant l'exécution de la suspension.
            </p>
          </div>
          <div className="order-1 md:order-2">
            <h2 className="text-3xl font-bold">
              Défense de votre permis de conduire
            </h2>
            <p className="mt-4 text-zinc-600">
              Rétention administrative, invalidation, commission médicale :
              recours gracieux devant le préfet, chronologie d'urgence et, si
              nécessaire, mise en relation avec un avocat partenaire.
            </p>
            <Link
              href="/deposer?type=SUSPENSION"
              className="mt-6 inline-block rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Défendre mon permis
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="rounded-3xl bg-zinc-900 px-8 py-16 text-center text-white">
          <h2 className="text-3xl font-bold">
            Un délai passe vite. Saisissez la vôtre.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            La démo ci-dessus est <span className="font-semibold text-white">gratuite et sans stockage</span> — aucun fichier requis.
            Pour déposer votre vrai dossier (PV réel, lettre validée par un juriste), un crédit est requis : 39&nbsp;€ par amende, 59&nbsp;€ par suspension. Paiement à l&apos;acte, sans abonnement.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/deposer?type=AMENDE"
              className="inline-block rounded-full bg-emerald-500 px-8 py-3 font-semibold text-white hover:bg-emerald-400"
            >
              Déposer ma contravention
            </Link>
            <Link
              href="/deposer?type=SUSPENSION"
              className="inline-block rounded-full border border-white/20 px-8 py-3 font-semibold text-white hover:bg-white/10"
            >
              Déposer ma lettre de suspension
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-xl text-xs text-zinc-500">
            Démo gratuite ≠ dossier réel. Aucun paiement n&apos;est prélevé lors de la démo.
          </p>
        </div>
      </section>
    </div>
  );
}
