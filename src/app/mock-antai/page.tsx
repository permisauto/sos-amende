import { MockAntaiForm } from "./mock-antai-form";

export default function MockAntaiPage() {
  // Le token du mock est lu côté serveur (même valeur que la route API :
  // ANTAI_MOCK_TOKEN en CI/prod, "dev-antai-mock" en développement).
  const token =
    process.env.ANTAI_MOCK_TOKEN ??
    (process.env.NODE_ENV === "production" ? "" : "dev-antai-mock");

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Portail ANTAI de simulation — développement / E2E uniquement. Jamais
        utilisé en production (garde-fou produit).
      </div>
      <h1 className="mt-6 text-2xl font-bold">Simulation de dépôt ANTAI</h1>
      <p className="mt-2 text-zinc-600">
        Cette page reproduit le formulaire de dépôt en ligne ANTAI. Le flux
        RPA/Playwright et la soumission juriste appellent cet endpoint local.
      </p>
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <MockAntaiForm token={token} />
      </div>
    </div>
  );
}