"use client";

import { useActionState, useRef, useState } from "react";
import { createDossier } from "../actions";

export function UploadForm() {
  const [state, formAction, pending] = useActionState(createDossier, undefined);
  const [type, setType] = useState("AMENDE");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function acceptFile(candidate: File | undefined | null) {
    if (!candidate) return;
    setFile(candidate);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.set("type", type);
    fd.set("pv", file);
    formAction(fd);
  }

  const previewUrl = file?.type.startsWith("image/")
    ? URL.createObjectURL(file)
    : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-700">
          Type d'infraction
        </span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-xl border border-zinc-300 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          <option value="AMENDE">Amende</option>
          <option value="SUSPENSION">Suspension de permis</option>
        </select>
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          acceptFile(e.dataTransfer.files[0]);
        }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging
            ? "border-emerald-500 bg-emerald-50"
            : "border-zinc-300 bg-zinc-50 hover:border-emerald-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Aperçu du PV"
                className="max-h-40 rounded-lg object-contain"
              />
            ) : (
              <span className="text-3xl">📄</span>
            )}
            <p className="text-sm font-medium text-zinc-800">{file.name}</p>
            <p className="text-xs text-zinc-500">
              {(file.size / 1024).toFixed(0)} Ko
            </p>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              Changer de fichier
            </button>
          </div>
        ) : (
          <div>
            <span className="text-3xl">⬆️</span>
            <p className="mt-2 text-sm font-medium text-zinc-700">
              Glissez votre avis de contravention ici
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              ou cliquez pour parcourir — JPEG, PNG, WebP ou PDF (8 Mo max)
            </p>
          </div>
        )}
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !file}
        className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Analyse de votre PV…" : "Lancer le dossier"}
      </button>
    </form>
  );
}