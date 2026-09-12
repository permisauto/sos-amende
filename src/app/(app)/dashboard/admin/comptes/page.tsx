import { requireAdmin } from "@/lib/dal";
import { ComptesAdmin } from "./comptes-admin";

export default async function AdminComptesPage() {
  await requireAdmin();
  const { listerComptesInternes } = await import("./actions");
  const comptes = await listerComptesInternes();

  return (
    <div>
      <h1 className="text-2xl font-bold">Comptes juristes</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Gérez les juristes qui traitent les dossiers. Les administrateurs sont
        créés via le script de provisionnement.
      </p>
      <div className="mt-8">
        <ComptesAdmin comptes={comptes as never} />
      </div>
    </div>
  );
}