import { redirect } from "next/navigation";

// Bibliothèque unifiée : la base juridique (gestion admin) et la bibliothèque
// (lecture juriste) sont désormais une seule page /dashboard/juriste/failles.
export default function AdminFaillesPage() {
  redirect("/dashboard/juriste/failles");
}