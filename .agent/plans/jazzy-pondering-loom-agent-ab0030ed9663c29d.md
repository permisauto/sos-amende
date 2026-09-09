# Plan — SOS Amende prêt à l'emploi (mode virement + vérification mock complète)

## Contexte
- Repo Next.js 16 App Router, Prisma 7 driver-adapter (`src/generated/prisma`), `public/uploads` local, `STRIPE_MOCK=1` en dev. Prod Vercel a `DATABASE_URL`, `AUTH_SECRET`, `AUTH_RESEND_KEY` mais pas `STRIPE_*`/`STORAGE_DRIVER=s3`/`CRON_SECRET`/`NEXT_PUBLIC_APP_URL`/`EMAIL_FROM` — volontairement en pause Stripe.
- Demande utilisateur : rester en **virement** le temps d'avoir les accès Stripe, et **vérifier que tout fonctionne logiquement avec des dossiers mock** (toutes fonctionnalités, tous statuts, juriste inclus). Ne pas lancer la réal. avant plan figé.
- Incident réglé en build précédent : `src/app/(app)/dashboard/juriste/[id]/page.tsx:417` + `src/app/(app)/dashboard/juriste/actions.ts:232` — `modifierLettre` bloquait si signature illisible, dossiers démo `pv-*`/`dec-*` renvoyaient `Dossier introuvable`, `Télécharger` absent en `A_VERIFIER`. Fix livré : `lettre-pdf.tsx:29` signature nullable, `actions.ts:16` `DEMO_IDS`, `api/dossier/[id]/lettre/route.ts` génération à la volée, bandeau démo `page.tsx:372`. Build vert.

## Objectif de ce plan
Rendre le SaaS **logiquement complet et vérifiable de bout en bout sans Stripe**, avec des dossiers mock réalistes couvrant tous les statuts, et figer la feuille de route avant exécution.

## Stratégie — virement-only
- Ne touche pas au code Stripe (`src/app/api/stripe/*`, `src/lib/paiement.ts::traiterPaiement`). Laisser `STRIPE_MOCK=1` et le portail `/mock-stripe`. Le virement est le chemin principal.
- Flux virement existant à conserver : `src/app/api/paiement/virement/route.ts:15` (crée `Payment` `PENDING_VIREMENT` 39/59€, upsert user, email Resend défensif), `src/app/(app)/dashboard/paiement/[id]/paiement-form.tsx:114` (RIB test, `payerParVirement` server action + bouton « J'ai effectué le virement »). Aucun `credits` auto-débité côté virement — validation manuelle juriste/admin.
- Compléter seulement le **back-office validation virement** : page admin `src/app/(app)/dashboard/admin/paiements` existe déjà mais a été patchée à la va-vite ; vérifier qu'elle liste `PENDING_VIREMENT`, permet `confirmerVirement` (crédite `credits+1`) / `rejeterVirement`, et envoie `notifierStatut`.
- Garde-fou : `.env.example:31` commente `STRIPE_MOCK=1` ne jamais en prod ; `.env` local garde `STRIPE_MOCK=1`. Ajouter un bandeau UI « Paiement par carte bientôt » déjà présent `paiement-form.tsx:137`.

## Stratégie — dossiers mock vérification complète
- Ne pas se contenter du fallback `page.tsx:80` (`try/catch → mock si DB down`) qui rend les dossiers démo non actionnables (raison du bug juriste). Utiliser des **rows DB réels** créés par script, visibles pour `e2e-client@test.local` et pour la queue juriste.
- Source existante : `scripts/seed-test-dossiers.ts` — 8 dossiers couvrant `EN_ANALYSE`/`A_VERIFIER`/`PRET`/`ENVOYE`/`RESOLU`/`REJETE` en `AMENDE` + `SUSPENSION`, avec `pvTexte`, `extractedData`, `failleJuridiqueId`, `lettreGeneree`, `Courrier` (pdfUrl/signatureUrl), `DossierEvent` timeline, `DossierFaille` CONFIRMEE/CANDIDATE. Actuellement `pdf` mock `%PDF-1.4 mock` et PNG 1x1 transparent — à remplacer par vrais PDF générés via `generateLettrePdf`.
- Plan :
  1. Corriger `scripts/seed-test-dossiers.ts:23` — utiliser `generateLettrePdf` + `storageWrite` pour de vrais PDF signés au lieu de `%PDF-1.4 mock`, et clés `pv/`/`signatures/` cohérentes avec `STORAGE_DRIVER=local`.
  2. Ajouter `npm run seed:mock` (`prisma db seed` + `tsx scripts/seed-test-dossiers.ts`) et le documenter `AGENTS.md:Commands`.
  3. Étendre `prisma/seed.ts` pour la base de faille + users uniquement ; laisser le script mock pour les dossiers (idempotent : `deleteMany` préalable sur les dossiers de `e2e-client@test.local` avant recréation).
  4. S'assurer que `src/app/(app)/dashboard/cases/page.tsx:35` et `juriste/page.tsx:60` voient ces dossiers (juriste voit tous statuts, filtrable `?f=PRET|A_VERIFIER|ENVOYE|ALL`).
  5. Garder le fallback mock `page.tsx:80` comme filet de sécurité DB down, mais y ajouter un header « Mode démo hors-DB » (déjà fait coté juriste `[id]`, à répliquer côté `cases/[id]`).

## Périmètre fonctionnel à vérifier (check-list)
Chaque ligne = 1 test manuel avec mock dossier correspondant :

| # | Rôle | Fonction | Fichier | Critère |
|---|------|----------|---------|---------|
|1|Client|Dépôt PV + OCR human-in-the-loop|`cases/new/upload-form.tsx`, `lib/ocr.ts:mock`, `cases/actions.ts:createDossier`|`preview pré-rempli`, `EN_ANALYSE`|
|2|Client|Analyse + moteur failles|`cases/[id]/analyse-form.tsx`, `lib/moteur.ts:detecterFailles`|failles `ACTIVE` détectées, `PROPOSEE` affichée « à valider », score %|
|3|Client|Signature canvas → `PRET`|`cases/[id]/signature-pad.tsx`, `cases/actions.ts:signerDossier`|canvas `toDataURL`, `Courrier` créé, PDF `storageWrite`|
|4|Juriste|File d'attente filtrable|`juriste/page.tsx:60`|filtres `PRET`/`A_VERIFIER`/`ENVOYE`/`ALL`|
|5|Juriste|Édition lettre|`juriste/[id]/lettre-edition.tsx` + `actions.ts:232`|`Enregistrer` ok même si signature manquante, PDF régénéré|
|6|Juriste|Télécharger lettre|`juriste/[id]/page.tsx:417`, `api/dossier/[id]/lettre`|2 liens : stocké + génération à la volée|
|7|Juriste|Valider → envoi ANTAI mock|`juriste/actions.ts:143` `validerDossier`|`valideLe`, `ENVOYE`, accusé|
|8|Juriste|Rejeter / Retourner|`actions.ts:304/338`|motif ≥10 car., crédit rendu|
|9|Client|Kit LRAR + « J'ai envoyé »|`cases/[id]/lr-kit.tsx`, `cases/actions.ts:envoyerDossier`|`ENVOYE`+ event|
|10|Juriste|Décision OMP → `RESOLU`|`juriste/actions.ts:94`|bandeau client|
|11|Juriste|Confirmer/écarter faille|`juriste/[id]/failles-candidates.tsx`|DossierFaille `CONFIRMEE`|
|12|Avocat|Demande ↔ affectation|`cases/[id]/avocat-request.tsx`, `juriste/[id]/avocat-traitement.tsx`|LawyerMatch|
|13|Admin|Base juridique PROPOSEE→ACTIVE|`admin/failles/failles-admin.tsx`|`validerPropositionFaille`|
|14|Admin|Radars CRUD|`admin/radars`|étalonnage expiré|
|15|Admin|Aperçu virements|`admin/paiements`|PENDING→confirmé|
|16|Client|Preuves|`components/preuves.tsx`|upload `storageWrite`, event `PREUVE`|
|17|Client|RGPD export/effacement|`parametres/actions.ts`, `api/rgpd/export`|JSON + `storageDelete`|
|18|Cron|Rappels J10/J3/J0|`lib/rappels.ts`, `api/cron/rappels`|email défensif|
|19|Marketing|Démo scan|`components/demo-scan.tsx`, `api/demo/analyse`|jamais de stockage|
|20|Paiement|Virement|`api/paiement/virement` + `paiement/[id]`|ref 8 car., email RIB|

On restera en virement-only : la ligne 19 ne couvre pas Stripe, juste `STRIPE_MOCK` masqué.

## Étapes d'exécution (après validation du plan)
1. **Nettoyer l'existant** — `npx prisma migrate deploy` + `npx prisma db seed` sur dev, vérifier `public/uploads/demo-*` trackés (`.gitignore:53`).
2. **Réparer le seed mock** — patch `scripts/seed-test-dossiers.ts` (vrai PDF via `generateLettrePdf`, clés `pdfs/`, `signatures/`, `pv/`), `package.json:seed:mock`, idempotence.
3. **Virement back-office** — auditer `src/app/(app)/dashboard/admin/paiements/page.tsx` + `actions.ts:confirmerVirement`, ajouter tests `lib/paiement.test.ts` si manquant.
4. **Parité fallback** — ajouter bandeau démo côté `cases/[id]` si `isDemo`, documenter `AGENTS.md`.
5. **Plan de vérification** — lancer `npm run dev` + `npm run seed:mock`, parcourir les 20 lignes ci-dessus avec 2 comptes (`e2e-client@test.local` credits 50, `e2e-juriste@test.local`), capturer screenshots, noter les écarts. Lancer `npm test` + `npx tsc --noEmit` (build déjà vert 29s).
6. **E2E ciblé** — `npm run test:e2e` sur `juriste`, `flux-complet`, `paiement` (port 3200) avec `STRIPE_MOCK=1` ; corriger uniquement les flaky liés au fix juriste.
7. **Livrable** — `PLAN_MOCK_VERIF.md` + checklist cochée, aucun secret commité, `.env.example` à jour.

## Risques & garde-fous
- Faux article juridique : seules `FailleJuridique.ACTIVE` alimentent `remplirTemplate` (`lib/moteur.ts`). `PROPOSEE` jamais utilisée côté moteur.
- `public/uploads` sur Vercel prod éphémère : en vérif locale OK (`local`), en prod future passer à `STORAGE_DRIVER=s3`.
- `DEMO_IDS` large (`pv-*`/`dec-*`) — resserrer si besoin aux 9 ids exacts pour éviter de masquer un vrai bug `Dossier introuvable`.
- `src/lib/storage.ts:40` `path.join` Windows OK, mais vérifier `storageDelete` en RGPD sur S3.

## Hors périmètre (prod Stripe)
Mise en prod Stripe/S3/Resend domaine/CRON_SECRET/NEXT_PUBLIC_APP_URL/Sentry — listé dans le message précédent, à faire quand les accès Stripe arrivent. Non inclus dans cette itération virement-only.

## Validation du plan
- Critère GO : 20 lignes vérifiées manuellement + `npm test` + `build` + 1 run E2E mock passent.
- Critère NO-GO : on ne merge pas de migration destructive, on ne touche pas à `STRIPE_MOCK` prod, on ne commit pas de `.env`.
