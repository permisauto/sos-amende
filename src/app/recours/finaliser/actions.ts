"use server";

import { confirmerDepotSurPortail as libConfirmerDepotSurPortail } from "@/lib/lien-depot";

export type DepotState = { ok?: boolean; error?: string } | undefined;

/**
 * Bouton « J'ai déposé ma contestation » de la page /recours/finaliser :
 * confirme le dépôt sur le portail officiel et marque le dossier ENVOYE
 * (garde-fous : lien valide + statut PRET dans confirmerDepotSurPortail).
 */
export async function confirmerDepotSurPortail(
  _prev: DepotState,
  formData: FormData,
): Promise<DepotState> {
  const token = String(formData.get("token") ?? "");
  const resultat = await libConfirmerDepotSurPortail(token);
  if (!resultat.ok) return { error: resultat.error };
  return { ok: true };
}