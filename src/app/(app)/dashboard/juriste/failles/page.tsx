import { requireJuriste } from "@/lib/dal";
import { getMockFailles } from "@/lib/mock-failles";
import { FaillesList } from "./FaillesList";

export default async function JuristeFaillesPage(
  props: PageProps<"/dashboard/juriste/failles">,
) {
  await requireJuriste();
  const { f } = await props.searchParams;
  const raw = typeof f === "string" ? f.toUpperCase() : "ALL";
  const filter = ["ACTIVE", "INACTIVE", "PROPOSEE", "ALL"].includes(raw)
    ? raw
    : "ALL";

  // Use mock-failles (persistant via fichier) pour résilience DB
  const failles = getMockFailles(filter);

  return <FaillesList failles={failles} filter={filter} />;
}