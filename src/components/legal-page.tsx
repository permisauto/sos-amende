export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">Dernière mise à jour : {updatedAt}</p>
      <div className="prose prose-zinc mt-8 space-y-6 text-sm leading-7 text-zinc-700">
        {children}
      </div>
    </div>
  );
}
