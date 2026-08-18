import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Stockage des pièces (PV, signatures, PDF).
 *
 * Deux drivers :
 *  - "local" (défaut, dev/E2E) : écrit dans `public/uploads/`, aucune clé
 *    requise, les URL stockées en base (`/uploads/...`) servent telles quelles.
 *  - "s3" (production) : bucket S3-compatible UE (Scaleway/OVHcloud, etc.).
 *    Les URL sont générées à la volée (presigned GET, TTL 1 h) au rendu des
 *    pages — on stocke toujours un chemin relatif en base, jamais une URL.
 *
 * Le format en base (`/uploads/<chemin>`) est identique dans les deux modes.
 */
export function isStorageS3(): boolean {
  return process.env.STORAGE_DRIVER === "s3";
}

const UPLOADS_PREFIX = "/uploads/";

/** Résout une URL de fichier : telle quelle en local, signée en S3. */
export async function storageUrl(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  // Texte libre (motif de rejet, note de décision) → passthrough.
  if (!raw.startsWith("/uploads/") && !/^https?:\/\//i.test(raw)) return raw;
  // URL externe (ex. preuve de certificat saisie par l'admin) → passthrough.
  if (/^https?:\/\//i.test(raw)) return raw;

  if (!isStorageS3()) return raw;

  const key = raw.slice(UPLOADS_PREFIX.length);
  return presignGet(key);
}

/**
 * Écrit un fichier et renvoie la valeur à stocker en base (`/uploads/<chemin>`).
 * En mode S3, `key` correspond au chemin objet (ex. `pv/2026-...png`).
 */
export async function storageWrite(key: string, buffer: Buffer): Promise<string> {
  if (isStorageS3()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer }));
    return `${UPLOADS_PREFIX}${key}`;
  }

  const filePath = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return `${UPLOADS_PREFIX}${key}`;
}

/**
 * Supprime un fichier (RGPD : effacement des pièces lors de la suppression du
 * compte). En local : suppression du fichier dans `public/uploads/`. En S3 :
 * DeleteObject (best-effort).
 */
export async function storageDelete(raw: string | null | undefined): Promise<void> {
  if (!raw || !raw.startsWith(UPLOADS_PREFIX)) return;

  const key = raw.slice(UPLOADS_PREFIX.length);
  if (isStorageS3()) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return;
  }

  const filePath = path.join(process.cwd(), "public", "uploads", key);
  await import("node:fs/promises").then(({ unlink }) => unlink(filePath));
}

function bucket(): string {
  const b = process.env.STORAGE_BUCKET;
  if (!b) throw new Error("STORAGE_BUCKET requis en mode STORAGE_DRIVER=s3");
  return b;
}

async function presignGet(key: string): Promise<string> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: 3600,
  });
}

let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

async function getS3Client(): Promise<import("@aws-sdk/client-s3").S3Client> {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const endpoint = process.env.STORAGE_ENDPOINT;
    s3Client = new S3Client({
      region: process.env.STORAGE_REGION ?? "eu-west-1",
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
      },
    });
  }
  return s3Client;
}