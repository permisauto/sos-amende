"use client";

import { useSearchParams } from "next/navigation";

export function CompteSupprimeBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("compte-supprime") !== "1") return null;

  return (
    <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      Votre compte et vos données ont été supprimés. Merci de nous avoir fait
      confiance.
    </div>
  );
}