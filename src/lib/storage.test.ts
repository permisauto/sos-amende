import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Tests du driver "local" de src/lib/storage.ts (dev/E2E) : le format stocké
 * en base est `/uploads/<clé>` et sert tel quel. On isole le `process.cwd()`
 * dans un dossier temporaire pour ne pas écrire dans `public/uploads/`.
 */
describe("storage (driver local)", () => {
  let racine: string;
  let cwdInitial: string;

  beforeAll(async () => {
    cwdInitial = process.cwd();
    racine = await mkdtemp(path.join(tmpdir(), "sos-amende-storage-"));
    await mkdir(path.join(racine, "public", "uploads"), { recursive: true });
    process.chdir(racine);
  });

  afterAll(async () => {
    process.chdir(cwdInitial);
    await rm(racine, { recursive: true, force: true });
  });

  it("storageWrite renvoie une URL /uploads/ et storageRead relit le contenu", async () => {
    const { storageWrite, storageRead } = await import("./storage");
    const contenu = Buffer.from("preuve-de-test");

    const url = await storageWrite("test/un.txt", contenu);
    expect(url).toBe("/uploads/test/un.txt");

    const lu = await storageRead(url);
    expect(lu?.toString()).toBe("preuve-de-test");
  });

  it("storageRead renvoie null sur une pièce absente ou une valeur vide", async () => {
    const { storageRead } = await import("./storage");
    expect(await storageRead("/uploads/inexistant.png")).toBeNull();
    expect(await storageRead(null)).toBeNull();
    expect(await storageRead(undefined)).toBeNull();
  });

  it("storageUrl : passthrough en local, texte libre et URL externes inchangés", async () => {
    const { storageUrl } = await import("./storage");
    expect(await storageUrl("/uploads/pv/a.png")).toBe("/uploads/pv/a.png");
    expect(await storageUrl("Plaque non relevée")).toBe("Plaque non relevée");
    expect(await storageUrl("https://exemple.fr/cert.pdf")).toBe("https://exemple.fr/cert.pdf");
    expect(await storageUrl(null)).toBeNull();
  });

  it("storageDelete supprime le fichier, puis storageRead renvoie null", async () => {
    const { storageWrite, storageRead, storageDelete } = await import("./storage");
    const url = await storageWrite("test/supprime.txt", Buffer.from("a supprimer"));
    expect(await storageRead(url)).not.toBeNull();

    await storageDelete(url);
    expect(await storageRead(url)).toBeNull();
  });

  it("storageDelete ignore silencieusement une clé hors /uploads/", async () => {
    const { storageDelete } = await import("./storage");
    await expect(storageDelete("texte libre")).resolves.toBeUndefined();
    await expect(storageDelete(null)).resolves.toBeUndefined();
  });

  it("storageWrite crée les répertoires manquants", async () => {
    const { storageWrite } = await import("./storage");
    const url = await storageWrite("profond/a/b/c.txt", Buffer.from("ok"));
    const lu = await readFile(path.join(racine, "public", "uploads", "profond", "a", "b", "c.txt"));
    expect(lu.toString()).toBe("ok");
    expect(url).toBe("/uploads/profond/a/b/c.txt");
  });

  it("isStorageS3 suit STORAGE_DRIVER", async () => {
    const { isStorageS3 } = await import("./storage");
    const initial = process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_DRIVER;
    expect(isStorageS3()).toBe(false);
    process.env.STORAGE_DRIVER = "s3";
    expect(isStorageS3()).toBe(true);
    if (initial === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = initial;
  });
});
