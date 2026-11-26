/**
 * Compression d'image côté client (Canvas natif, zéro dépendance) : réduit
 * le poids envoyé au serveur et donc les tokens d'entrée facturés par l'OCR.
 * Redimensionne au plus `maxDimension` px sur le grand côté puis ré-encode en
 * WebP qualité ~0.8. Une image sans gain (déjà petite, ou PDF) est renvoyée
 * telle quelle.
 */

export function dimensionsRedimensionnees(
  largeur: number,
  hauteur: number,
  maxDimension = 1600,
): { largeur: number; hauteur: number } {
  const plusGrand = Math.max(largeur, hauteur);
  if (plusGrand <= maxDimension) return { largeur, hauteur };
  const ratio = maxDimension / plusGrand;
  return {
    largeur: Math.max(1, Math.round(largeur * ratio)),
    hauteur: Math.max(1, Math.round(hauteur * ratio)),
  };
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image illisible"));
    img.src = url;
  });
}

function canvasVersBlob(
  canvas: HTMLCanvasElement,
  type: string,
  qualite: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, qualite));
}

export async function compresserImage(
  file: File,
  opts: { maxDimension?: number; qualite?: number } = {},
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1600;
  const qualite = opts.qualite ?? 0.8;

  if (!file.type.startsWith("image/")) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await chargerImage(url);
    const { largeur, hauteur } = dimensionsRedimensionnees(
      img.naturalWidth,
      img.naturalHeight,
      maxDimension,
    );
    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, largeur, hauteur);
    const blob = await canvasVersBlob(canvas, "image/webp", qualite);
    if (!blob || blob.size >= file.size) return file; // pas de gain → original
    const nom = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], nom, { type: "image/webp" });
  } catch {
    return file; // compression impossible → on garde l'original (jamais bloquant)
  } finally {
    URL.revokeObjectURL(url);
  }
}
