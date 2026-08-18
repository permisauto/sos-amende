"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CheckoutType = "AMENDE" | "SUSPENSION";

export function CheckoutButton({
  type,
  children,
}: {
  type: CheckoutType;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        router.push(data.url);
      } else {
        router.push(
          `/login?callbackUrl=/pricing&error=${encodeURIComponent(data.error ?? "checkout")}`,
        );
      }
    } catch {
      router.push("/login?callbackUrl=/pricing&error=checkout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "Redirection…" : children}
    </button>
  );
}