import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/dal";
import { RadarsAdmin, type RadarDto } from "./radars-admin";

export default async function AdminRadarsPage() {
  await requireAdmin();

  const radars = await prisma.radarCalibration.findMany({
    orderBy: { dateExpiration: "desc" },
  });

  const dto: RadarDto[] = radars.map((r) => ({
    id: r.id,
    radarId: r.radarId,
    dateExpiration: r.dateExpiration.toISOString(),
    preuveUrl: r.preuveUrl,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Étalonnage des radars</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Certificats d'étalonnage des radars (motif juridique de contestation).
      </p>
      <div className="mt-6">
        <RadarsAdmin radars={dto} />
      </div>
    </div>
  );
}