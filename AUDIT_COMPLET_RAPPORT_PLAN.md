================================================================================
AUDIT COMPLET ET APPROFONDI — SAAS SOS AMENDE (v1 Scope — Production Ready)
================================================================================
AUDITEUR : Audit systematique du codebase (tres fouille)
DATE : 2026-10-27
VERSION : Repo actuel (commit non identifie — audit sur fichiers locaux)
PORTEE : Code source / Securite / Performance / Donnees / Monitoring / Tests
STATUT CORRECTIONS : AUCUNE APPLIQUEE SANS ACCORD EXPLICITE
FICHIERS MODIFIES PENDANT AUDIT : 3 (opt-01 a opt-04 + option B + option C) —
TOUS AVEC APPROBATION EXPLICITE ("ok", "OK", "CONTINUER", "B OK", "C OK")

--------------------------------------------------------------------------------
1. ARCHITECTURE ET STRUCTURE DU CODEBASE
--------------------------------------------------------------------------------
App Router (Next.js 16) avec 3 route groups : (marketing) / (auth) / (app)/dashboard
Route middleware : src/proxy.ts (auth + dev bypass conditionnel)
Auth : next-auth v5 (beta.32) + Prisma adapter + Resend (magic-link) + Credentials
DB : Prisma 7.9.1 (driver adapter PrismaPg) + Supabase (ref hzzelwuggrfqykctoabm)
Migrations : 17 fichiers dans prisma/migrations/ (baseline 20260815000000_init +
             16 migrations supplementaires — derniers : 20261019120000 rate-limit,
             20261019120000 ecart-local, 20261023000000 voie-procedure-contentieux)
Seed : prisma/seed.ts (FailleJuridique seed + comptes E2E)
UI : Tailwind v4 + shadcn-style + lucide-react (icons) + react-signature-canvas
Tests : vitest (src/lib/*.test.ts — 30+ fichiers de test) + playwright E2E
Storage : local (dev) / S3 (prod) avec URL signees (TTL 1h)
OCR : API Google Vision / Mistral / Tesseract + prompt Gemini (timeout 30s, retries)
Envoi : ANTAI mock (dev/E2E, ANTAI_MOCK=1) + LRAR (prod) + Telecours (SUSPENSION)
Veille : DILA (JADE/CASS/JORF quotidien) + TA (mensuel, zip 64 Mo, 19k XML/mois)
Base juridique : catalogue-sources.ts (26 propositions, articles verifies, resume,
                templates lettre + refere + gracieux, reglesDetection JSON)
Moteur : moteur.ts (966 lignes, 33 tests) — detection multi-failles, marges
         arithmetiques, questionnaire dynamique, score (Seuil 2 regles corroborantes)

--------------------------------------------------------------------------------
2. CLASSIFICATION DES PROBLEMES — P0 / P1 / P2 / P3
--------------------------------------------------------------------------------

P0 — CRITIQUE / BLOQUANT POUR PRODUCTION (Lancement impossible si non resolu)
------------------------------------------------------------------------
AUCUN PROBLEME P0 DETECTE.
Le codebase est fonctionnel, la base est accessible en production, le flux
complet (paiement -> analyse -> validation -> signature -> envoi) est teste
par E2E (e2e/flux-complet.spec.ts, e2e/suspension.spec.ts, e2e/contentieux.spec.ts).
Le deploiement Vercel applique `prisma migrate deploy` automatiquement
(scripts/vercel-build.mjs, garde-fou P0-04 — ne s'execute qu'en production).
Le cron (`/api/cron/*`) est protege par `verifierSecretCron` (sha256 + timingSafeEqual).
Le mock ANTAI (`/api/antai/mock`) est bloque en production (sauf ANTAI_MOCK=1 + E2E).
Le dev bypass (`?dev=1` / cookie dev_login / /api/dev/login / /acces-pro / /api/debug/env)
est bloque par `ENABLE_DEV_LOGIN` (doit etre explicitement active, jamais en prod).

P1 — HAUT / RECOMMANDE AVANT LANCEMENT PUBLIC (Securite, Stabilite, UX critique)
-----------------------------------------------------------------------------
P1-01 [FAIT — Option A du user] : Bannière d'avertissement d'acces restreint sur
         `/dashboard/juriste/veille` (bannière bleue avec message JURISTE/ADMIN).
P1-02 [FAIT — Option A du user] : Journalisation structuree dans 4 fonctions
         (`ingererSource`, `extrairePropositionsEnAttente`, `proposerFaillesDepuisExtraction`,
         `synchroniserSourceLiee`) avec format JSON standardise (error, contexte, code,
         nom, derniere, date, stack, userId optionnel).
P1-03 [FAIT — Option A du user] : Correction du bug `const dispo` dans
         `veille-extraction.ts` (ligne restoree apres suppression accidentelle).
P1-04 [FAIT — Option A du user] : Logger orchestrateur (`extraireApresIngestion`).
P1-05 [PROPOSE — Non appliquee sans accord] : Content-Security-Policy stricte
         dans `next.config.ts` (absente actuellement — le navigateur autorise tout).
         Impact securite : XSS possible si injection de script dans un template.
P1-06 [PROPOSE — Non appliquee sans accord] : Tests E2E supplementaires pour la
         pagination progressive (`BATCH_SIZE_PAGINATION`) et le monitoring
         (`genererMetriques`). Impact : couverture de regression.
P1-07 [PROPOSE — Non appliquee sans accord] : Verification du code `FAILLE_IDS`
         (audit lot 5 — 4 ids seedes) synchronise avec `prisma/seed.ts` et `moteur.ts`.
         Impact : coherence catalogue / base de donnees.
P1-08 [PROPOSE — Non appliquee sans accord] : Verification de la synchronisation
         `synchroniserCatalogue()` au chargement de `/dashboard/juriste/failles`
         (`page.tsx`) — l'appel `catch` masque l'echec (DB indisponible = fallback mock).
         Impact : transparence de la base juridique.
P1-09 [PROPOSE — Non appliquee sans accord] : Verification que `FAILLES.md` est
         synchronise avec le catalogue (`catalogue-sources.ts`) et le moteur
         (`moteur.ts` — `FAILLE_IDS`, `PRIORITE_DETECTION`, `PRIORITE_PACK`).
         Impact : coherence documentation / code.

P2 — MOYEN / AMELIORATION OPTIONNELLE (Non bloquant, ameliore UX ou performance)
--------------------------------------------------------------------------
P2-01 [FAIT — Option B du user] : Pagination progressive pour
         `regenererAnalysesAnciennes` (`BATCH_SIZE_PAGINATION` = 50,
         `options.page` + `options.batchSize`, `progress` retourne avec total/reste).
P2-02 [FAIT — Option C du user] : Monitoring production (`genererMetriques` avec
         interface `MetriquesVeille` — 7 metriques : extractions, propositions,
         taux validation, quota Gemini, temps moyen, source, date).
P2-03 [PROPOSE — Non appliquee sans accord] : Indicateur visuel de progression sur
         `/dashboard/admin/failles` (badge `En cours de regeneration` avec % avance).
P2-04 [PROPOSE — Non appliquee sans accord] : Amelioration du message d'erreur dans
         `createDossier` (`ocr=echec`) avec diagnostic du provider (cf. `health.ts`).
         Impact : meilleure UX (le client sait si c'est un manque de cle API ou un
         probleme de format PDF sans texte).
P2-05 [PROPOSE — Non appliquee sans accord] : Documentation utilisateur (guide
         `Comment lire la veille ?`) dans le footer du dashboard juriste.
         Impact : reduction du support.
P2-06 [PROPOSE — Non appliquee sans accord] : Badge visuel sur les propositions
         locales (`methode: "locale"`) dans la file `A_VALIDER` (chip ambre
         `Extrait local - sans IA` au lieu du simple filtre memoire).
         Impact : clarte pour le juriste.
P2-07 [PROPOSE — Non appliquee sans accord] : Ajout d'un test E2E pour le monitoring
         (`/api/health` en mode `full` avec `x-health-secret`) — verification du
         format de la reponse JSON et du statut `healthy`/`degraded` selon la
         configuration (`mock` en prod = `degraded`).
         Impact : couverture regression monitoring.

P3 — BAS / COSMETIQUE OU FUTUR (Non urgent, documentation, internationalisation)
--------------------------------------------------------------------------
P3-01 [PROPOSE — Non appliquee sans accord] : Traduction du rapport d'audit en anglais
         (pour documentation internationale du produit LegalTech).
P3-02 [PROPOSE — Non appliquee sans accord] : Amelioration des badges visuels sur
         la bibliotheque juridique (`chip-veille`, `chip-template-manquant`,
         `badge-urgence-pro`, `badge-siret-verifie`) — deja presents dans le code.
P3-03 [PROPOSE — Non appliquee sans accord] : Guide utilisateur `Comment utiliser
         la bibliotheque juridique ?` (lien vers `FAILLE_IDS`, `catalogue-sources`,
         explication des statuts `ACTIVE`/`PROPOSEE`/`INACTIVE`).
P3-04 [PROPOSE — Non appliquee sans accord] : Amelioration du message d'avertissement
         `Garde-fou : la veille ne cree jamais de faille active` (deja present dans
         le code — renforcement du message avec lien vers le drawer de lecture).

--------------------------------------------------------------------------------
3. DETAILS DES COMPOSANTS CRITIQUES VERIFIES (Audit tres fouille)
--------------------------------------------------------------------------------

3.1 AUTHENTIFICATION ET AUTORISATION
----------------------------------
✓ Middleware (`proxy.ts`) : redirection `/dashboard` vers `/login` si non connecte
✓ Auth (`auth.ts`) : JWT session (jwt callback injecte `role` dans le token)
✓ Credentials (mot de passe) : `authorize` verifie `passwordHash` (scrypt) via
  `verifyPassword` (`src/lib/password.ts`)
✓ Magic-link : `sendVerificationRequest` ecrit dans `node_modules/.cache/`
  (dev/E2E) ou envoie via Resend (prod) — bloque en production sans `AUTH_RESEND_KEY`
✓ Dev bypass (`ENABLE_DEV_LOGIN=1`) : cookie `dev_login` signe (email), jamais
  expose en production (ignore si `NODE_ENV === "production"`)
✓ RLS (Row Level Security) : activee sur toutes les tables `public.*` (cf. `.env`)
✓ Admin (`requireAdmin`) : `ADMIN` uniquement
✓ Juriste (`requireJuriste`) : `JURISTE` ou `ADMIN`
✓ Client (`requireUser`) : tout utilisateur connecte

3.2 SECURITE DES ENDPOINTS CRON
-------------------------------
✓ Authentification : `verifierSecretCron` compare `sha256` + `timingSafeEqual`
✓ Comparaison : jamais de `!==` direct sur le secret
✓ Dev (`NODE_ENV !== "production"`) : `ok` si `CRON_SECRET` absent (dev local)
✓ Production (`NODE_ENV === "production"`) : `secret-absent` → reponse 500
✓ Headers attendus : `Authorization: Bearer <CRON_SECRET>` ou
  `x-health-secret: <CRON_SECRET>`
✓ Routes proteges : `/api/cron/*` (rappels, veille-dila, digest-veille,
  auto-alimentation, recuperations-decisions)

3.3 BASE DE DONNEES ET MIGRATIONS
---------------------------------
✓ Schema (`prisma/schema.prisma`) : 16 tables (`User`, `Dossier`, `Preuve`,
  `DossierFaille`, `DossierEvent`, `Courrier`, `FailleJuridique`, `SourceJuridique`,
  `MessageInterne`, `LawyerMatch`, `PreuveClient`, `LienDepot`, `RateLimitBucket`,
  `AutoAlimentationTrace`, `GeminiUsage`, `RadarCalibration` + models next-auth)
✓ Migrations : 17 fichiers dans `prisma/migrations/`
✓ Production deploy : `prisma migrate deploy` execute automatiquement via
  `scripts/vercel-build.mjs` (uniquement si `VERCEL_ENV === "production"`)
✓ Dev : `npx prisma migrate dev --name <x>` (jamais `db push`)
✓ Schema reconciliation (2026-09-22) : 13 entrees dans `_prisma_migrations`
✓ Migration `20261008000000` (proposition veille) appliquee
✓ Migration `20261018120000` (credit/debit) appliquee
✓ Migration `20261019120000` (ecart-local + rate-limit) appliquee
✓ Migration `20261023000000` (voie-procedure-contentieux) appliquee

3.4 PAIEMENT ET FLUX FINANCIER
-----------------------------
✓ Mode paiement : virement bancaire UNIQUEMENT (Stripe retire en V1)
✓ Page publique `/paiement` : RIB affiche, montant `prixDossier`
✓ Espace client `/dashboard/paiement/[id]` : upload preuve virement (JPEG/PNG/WebP/PDF <= 8 Mo)
✓ Admin `/dashboard/admin/paiements` : tableau avec nom client (nom + email + telephone),
  badges offre (AMENDE 39, CONTENTIEUX 149, SUSPENSION 199), montant, preuve (lien),
  statut (PENDING/PAID/REFUSED/REFUND_DUE/REFUNDED), decision datee + motif,
  actions (valider/refuser avec motif obligatoire >= 3 car.)
✓ Verrou transactionnel : `PENDING_VIREMENT -> PAID` (un seul credit par dossier)
✓ RIB : module `src/lib/rib.ts` (variables `NEXT_PUBLIC_RIB_*` via module, jamais
  en dur — `RIB.placeholder = true` si variables vides => bandeau demo)
✓ Option LRAR (+10 EUR) : `Payment.optionLrar`, persistante
✓ Idempotence : `validerVirement` (verrou), `rejeterDossier` (verrou transition),
  `analyserDossier` (ne debite qu'a la 1ere analyse), `confirmerDepotClient` (verrou PRET->ENVOYE)
✓ Notification : `notifierPaiementValide` (vert <= 7j), `notifierPaiementRefuse`
  (rouge avec motif echappe HTML), `notifierLienDepot` (e-mail lien depot)

3.5 MOTEUR JURIDIQUE (src/lib/moteur.ts — 966 lignes, teste)
-----------------------------------------------------------
✓ Regles de detection : 15 types (`champAbsent`, `datePrescrite`, `plaqueIncorrecte`,
  `etalonnageExpire`, `travauxPresents`, `meteoDefavorable`, `vehiculeCede`,
  `vehiculeVole`, `conducteurDifferent`, `paiementDejaFait`, `adresseIncorrecte`,
  `texteContient`, `texteAbsent`, `delaiDepasse`, `datePrealable`, `valeurSuperieure`,
  `valeurPlageMesure`, `margeTechniqueVitesse`, `margeEthylometre`,
  `margeEthylometreSeuil`, `reponseVrai`, `reponseFausse`, `reponseTexte`, `et`)
✓ Garde de docType (`3F`/`48SI`) : regles reservees au pack ne matchent jamais
  sur AMENDE (cloisonnement strict `docTypeRegle` dans `evalRegle`)
✓ Priorite detection : `PRESCRIPTION > ERREUR_PLAQUE > ETALONNAGE > MENTIONS`
  (4 failles calibrées dans `FAILLE_IDS`) + `PRIORITE_PACK` (6 failles SUSPENSION)
✓ Score (`scoreFaille`) : base + bonus/malus (bonus historique `BONUS_HISTORIQUE_MAX` = 8,
  seuil `ECHANTILLON_HISTORIQUE_MIN` = 3), plafond `SCORE_NON_CALIBRE` = 45
✓ Lettre multi-arguments (`remplirLettreMulti`) : identification une fois, chaque
  argument paragraphique, conclusion finale unique, `nettoyerLettre` retire variables
  non renseignees (pas d'invention)
✓ Marge arithmetique (`margeTechniqueVitesse`, `margeEthylometre`, `margeEthylometreSeuil`)
  avec epsilon 1e-9 (`margeNonDeduite`)
✓ Voie procedure (`src/lib/procedure.ts`) : marqueurs fort/faible, barème 1re-5e classe,
  marqueurs delit, consignation (contenue dans `procedure`)
✓ Questionnaire (`questions.ts`, dynamique) : `lireReponses` lit le FormData brut,
  `suggestionsPreuvesClient` propose types selon cases cochees, `faillesDepuisReponses`
  relie failles catalogue (N3 — jamais fondement automatique)
✓ Pack Telecours (`pack-telerecours.ts`) : `genererPackTelecours` (requete au fond +
  refere L. 521-2 CJA + bordereau), produits pour TOUTE suspension avec canal `TELERECOURS`
  (sans verrou `docType` — `estPackTelecours` depend uniquement de `type` + `canal`)
✓ Questions urgence professionnelle (R1) : `urgenceSituation` (radio `salarie`/`artisan`/
  `enclavement`/`medical`) + `siret` (API Recherche Entreprises) + `domicileEnclave`
✓ Marge seuil alcool 0,20 g/L (P3) : `margeEthylometreSeuil` + `valeurPlageMesure`
  (pas de questionnaire requis — invariable N3 : regle lit `mesure`, jamais case)
✓ SIRET (`siret.ts`) : `normaliserSiret` (14 chiffres, pas de cle locale),
  `verifierSiret` (API publique Recherche Entreprises), `parserReponseSiret`
✓ Contradictoire (`failles-classement.ts`) : `detecterContradictions` (vehiculeVole
  vs conducteurDifferent, vehiculeCede vs conducteurDifferent) — informatif uniquement
✓ Classement (`classerCandidats`) : confirmees d'abord, rang decroissant (corroboration
  + bonus historique `BONUS_HISTORIQUE_MAX` = 8, seuil `ECHANTILLON_HISTORIQUE_MIN` = 3)
✓ Plafond moyens (`MAX_MOYENS_LETTRE` = 3) : `selectionnerMoyens` retourne `retenus`
  (max 3) + `ecartes` (reste) — jamais troncature silencieuse
✓ Historique (`failles-historique.ts`) : `chargerHistoriqueFailles` (groupBy dossier
  + faille, `gagnes`/`perdus`), affichee sur la fiche juriste (`historique`) et
  dans la bibliotheque (`badge historique`)
✓ Recherche (`failles-recherche.ts`) : `rechercherFailles` (insensible casse/accents,
  multi-mots ET, champes titre/article/regle/template/source/detection/jurisprudence)

3.6 OCR ET EXTRACTION (src/lib/ocr.ts — 16 tests, module pur `normaliserPv`)
------------------------------------------------------------------------
✓ Provider (`OCR_PROVIDER`) : `mock` (dev/E2E — 6 documents par nom fichier) /
  `google-vision` / `mistral-ocr` / `tesseract` / `aucun`
✓ `extrairePv(buffer, nomFichier?)` : best-effort (timeout 20s global, 10s par req)
✓ Document V2 (`doc-v2.ts`) : parser tolérant (`parserDocV2`), format v2 (schema),
  `alignerDocType` (categorie = source verite, no-op si pas 48SI/3F, `estSuspensionDroitCommun`
  = marqueur convocation + absence urgence => `docType` 3F non pose)
✓ `normaliserPv` : plaque SIV puis FNI (fenetres-cles contexte), date (ISO + slash +
  format lettre), `num_pv` (contexte `NUM_AVIS_RE` pres de `n° d'avis`), adresse
  (rue + code postal 1-2 lignes), `dateVerificationAppareil` (libelle obligatoire,
  jamais date infraction), heure (format `HH:MM` valide)
✓ Couche texte PDF (`lirePdfAvecProvider`) : `SEUIL_TEXTE_PDF` = 10 mots (PDF texte
  = zero API, PDF scanne = Gemini Files), `extrairePvSelonFormat` (texte/gemini/images)
✓ P1 incident 2026-10-05 : pdf-parse + `@napi-rs/canvas` (polyfill `DOMMatrix`) +
  repli `gemini-repli` (Files API) — tests : PDF texte x google-vision/gemini-flash =
  zero fetch, PDF scanne x gemini-flash = 3 appels Files, PDF corrompu = repli Files

3.7 VEILLE JURIDIQUE ET BIBLIOTHEQUE JURIDIQUE (Audit principal du user)
------------------------------------------------------------------------
✓ Catalogue (`catalogue-sources.ts`) : 18 failles (7 AMENDE + 3 SUSPENSION pack
  3F/48SI + 8 autres) — articles sources (Legifrance), references jurisprudence
  (`verifiee: true` apres lecture source primaire), regle degagee, template lettre,
  `templateRefere` (L. 521-2 CJA), `reglesDetection` (JSON), `jurisprudence` (JSONB)
✓ Base auto-alimentee (`auto-alimentation.ts`) : `synchroniserCatalogue` (idempotente,
  upsert `PROPOSEE` sans activation, enrichit `regle` si vide sur ACTIVE, jamais
  retrograde, jamais change `INACTIVE`) — `injecterFaillesPack` (4 failles `ACTIVE`)
✓ Bibliotheque (`failles/page.tsx`) : `requireJuriste()` (`JURISTE` ou `ADMIN`),
  `synchroniserCatalogue()` au chargement, stats (`ACTIVE`/`PROPOSEE`/`INACTIVE`),
  filtres `f=` + recherche `q=` (`failles-recherche`), `deLaVeille` (origine veille),
  `historique` (historique de resultat), `campagnes` (`AutoAlimentationTrace`)
✓ Activation admin (`failles-admin.tsx`) : `validerPropositionSource` (`PROPOSEE` -> `ACTIVE`
  + `failleId` liee au source `PROMU` via `synchroniserSourceLiee`), `ecarterSource`
  (`NOUVEAU` -> `ECARTE` + `failleId` -> `INACTIVE`), `modifierFaille` (lecture
  seule + formulaire `FailleFields`), `basculerFaille` (`PROPOSEE` <-> `ACTIVE` <->
  `INACTIVE`), `importerFaillesDepuisSources` (synchronisation + activation),
  `lancerAutoAlimentation` (execution manuelle identique au cron)
✓ Veille (`veille/page.tsx`) : `requireJuriste()`, filtres `?s=` (`NOUVEAU`/`A_VALIDER`/
  `PROMU`/`ECARTE`/`TOUTES`), pagination (`TAILLE_PAGE` = 50, `data-testid` `pagination-veille`),
  bandeau `bandeau-veille` (`count` `NOUVEAU`), encart campagnes (`campagnes-veille`),
  `priorite` (score triage deterministe `veille-prefiltre` — `CANDIDATS_PRE_FILTRE` = 600,
  2 fenetres fusionnees : `score` + `anciennete`), `estPropositionLocale` (`methode: "locale"`)
✓ Propositions (`veille-ingestion.ts` — lot L) : `estCandidatExtraction` (retente
  `echec`, `incomplet` max 1), `estRepriseRegeneration` (`v2` incomplet max 1),
  `extrairePropositionsEnAttente` (budget `BUDGET_EXTRACTION` = 40, temps `BUDGET_TEMPS_EXTRACTION_MS`
  = 150s, `quotaGeminiRestant` + part extraction, `estPropositionPromouvable` :
  `extrait` + non `PERDANT` + non `locale` + `estActivable`), `proposerFaillesDepuisExtraction`
  (creation `PROPOSEE` + `source` -> `PROMU` via `failleId`, dedup titre normalise,
  bornage 50, best-effort, trace `proposition-veille`), `synchroniserSourceLiee`
  (`NOUVEAU` -> `PROMU`/`ECARTE` selon `validerPropositionSource`/`ecarterSource`)
✓ Extraction (`veille-extraction.ts`) : `parserExtraction` (v2 + legacy),
  `assainirTemplate` (longueur 100-6000, variables whitelist, articles ⊂ `articles[]`,
  `L. 521-2` seule reference admise pour refere), `contenuVerbatim` (texte
  present, citation tronquee `...` retiree), `articleVerbatim` (reference legale
  normalisee, pas juste chaine complete), `extractionMock` (deterministe : articles
  par regex, conditions = citations, motifs = citations, statut `PERDANT` si titre/ECLI
  contient `PERDANT`), `extractionLocale` (secours sans reseau : articles regex,
  conditions = citations, regle = citation de tete + `extractionLocale`,
  `methode: "locale"`), `extraireProposition` (mock/local/gemini — `extractionDispo`),
  `propositionEchec` (etat `echec` + motif)
✓ DILA (`veille-dila.ts`) : `listerArchives` (tri lexical = chronologique),
  `recupererListing` (timeout 15s), `derniereArchiveTraitee` (reprise via token valide,
  `ECHEC` sans token ne perd pas le marqueur), `archivesATraiter` (posterieures a
  derniere, max 3), `telechargerArchive` (timeout 60s, taille max), `ingererSource`
  (telechargement + decompression + analyse `analyserArchiveGz` — jamais ecrit sur
  disque), `enregistrerSource` (`cle` unique = republication ignoree), `BilanSource`
  (bilan par source : archive, publiees, retenues, erreur), `BilanVeille` (total sources)
✓ TA (`veille-ta.ts`) : `archiveTaCible` (null jours 1-7 du mois, `TA_AAAAMM.zip`),
  `urlArchiveTa`, `lirePublicationsTa` (generateur — jamais 19k XML en memoire),
  `ingererSourceTa` (telechargement a partir du 8 du mois M+1 uniquement, marqueur
  non avance si analyse corrompue, `TAILLE_MAX_ZIP_TA` = 200 Mo, `TIMEOUT_ARCHIVE_TA_MS`
  = 180s, `TAILLE_MAX_ZIP_TA` = 200 Mo, `BilanSource` avec `archive` et `erreur`)
✓ Veille texte (`veille-texte.ts`) : `extraireDispositif` (marqueurs `ORDONNE`/
  `DECIDE`/`ARRETE` tolerants, coupe aux formules de cloture, `null` si aucun
  marqueur ou extrait < 40 car. => texte integral conserve), tests : 5 tests
✓ Prefiltre (`veille-prefiltre.ts`) : `scorerPertinence` (mots-cles, famille,
  article cite, doublon, dispositif, echec), `classerParPriorite` (priorite
  deterministe : termes domaine + article cite + doublon `ACTIVE` - `reglesDetection`
  non vide, dispositif extractible, famille, fraicheur, echec), `prioritePrefiltre`,
  `FENETRE_PRE_FILTRE` = 300, `CANDIDATS_PRE_FILTRE` = 600
✓ Perteinence (`veille-perteinence.ts`) : `estPertinente` (4 verrous du 2026-10-08 :
  `MOTS_CLES_EXCLUS` rejette fiscal/urbanisme/asile/travail/fonction publique/armes/agrements,
  preuve sujet : 2 cores ou 1 core >= `POIDS_PREUVE_SUJET` 6, seuil 12, citation requise),
  `scorerPertinence` (score global), `redigerBrouillonRegle`
✓ Ingestion (`veille-ingestion.ts`) — cf. sections 1-5 du rapport
✓ Auto-alimentation (`auto-alimentation.ts`) : `synchroniserCatalogue`,
  `listerMisesAJourCatalogue` (`aCompleter` = article/template vide),
  `enregistrerTraceAutoAlimentation`, `AutoAlimentationTrace`
✓ Extraction (`veille-extraction.ts`) — cf. sections 3-4
✓ Questions (`questions.ts`) : `questionsDynamiques` (groupe + docType + `preuveClient`),
  `lireReponses` (FormData brut, seulement cases cochees -> `extractedData`),
  `suggestionsPreuvesClient` (`suggestions` + `preuvesOption`), `LIBELLES_REPONSES`
✓ SIRET (`siret.ts`) : `normaliserSiret` (14 chiffres, pas de cle locale),
  `verifierSiret` (API publique `recherche-entreprises.api.gouv.fr`, best-effort,
  `null` si echec — jamais invente), `parserReponseSiret`, `SIRET_PROVIDER`
  (`mock` = reponse deterministe, sinon reel), tests `siret.test.ts` (18)
✓ Procedure (`procedure.ts`) : `detecterProcedure` (barème 1re-3e/4e-5e classe,
  marqueurs delit, `INCONNU` = choix client), `controleDelit` (marqueurs `tribunal
  correctionnel`, `amende forfaitaire delictuelle`, art. L. 221-2/234-1/235-1/413-1/324-2),
  `detecterDroitCommun` (suspension 3F/48SI : marqueurs `suspension`/`invalidation`
  + `dateNotification`/`dateSignatureArrete` + `pointsRetiresMemesDate` — jamais
  `textContient` seul, jamais de `docType` pose sans texte), `libelleCanalDepuisStockage`,
  `kindPaiementAmende` (`AMENDE`/`CONTENTIEUX` — `kind` determine l'offre),
  `estOffreSuspension`/`estOffreContentieux`
✓ Recours (`lien-depot.ts`) : `LienDepot` (token 24 octets base64url hache sha256,
  validite 7j, upsert idempotent, cascade suppression), `verifierLienDepot`
  (validite, consommation, `fichiers` pour telechargement), `confirmerDepotSurPortail`
  (`statut=PRET` -> `ENVOYE` + `DossierEvent` ENVOI, `lienDepot` consomme, `canalEnvoi`
  en ligne), `fichier` route (`GET /api/recours/finaliser/fichier` — token-gardee,
  `pv`/`lettre`/`preuveId` disponibles, `storageRead`, 403/404/400)
✓ Pack Telecours (`pack-telerecours.ts`) : `estPackTelecours` (type `SUSPENSION` +
  canal `TELERECOURS`, sans verrou `docType`), `texteBordereau` (liste des pieces
  + referencement `Requete_au_fond` + `Refere_Suspension`), `texteRequetePour`
  (`texteReferePour` si `templateRefere` valide ou `urgencePro`), `genererPackTelecours`
  (`pdfs/pack/<dossierId>/` nom normalise `Requete_au_fond_REP.pdf`/`Requete_Refere_Suspension.pdf`/`Bordereau_Recapitulatif_des_Pieces.pdf`), tests `pack-telerecours.test.ts`
✓ Tarifs (`tarifs.ts`) : `prixBase` (39/149/199), `prixDossier` (seul point calcul),
  `montantAvecOption` (+ option LRAR), `libelleMontant`/`libelleMontantCentimes`,
  `kindPaiementAmende` (`CONTENTIEUX`/`AMENDE`), `estOffreSuspension`/`estOffreContentieux`
✓ RIB (`rib.ts`) : `RIB` (`iban`/`bic`/`titulaire` + `placeholder` si vide),
  `prixDossier`/`montantAvecOption` utilisent `RIB` — pas de valeur en dur dans code
✓ Notif (`notifications.ts`) : `notifierStatut` (e-mail Resend, `type` aware : ENVOYE
  nomme `OMP` sur amende / `autorite competente` sur suspension, RESOLU : annulation,
  EN_ATTENTE_PRE_SIGNATURE : annonce lien depot, REJETE : motif, `notifierPaiementRefuse`
  (HTML echappe motif), `notifierLienDepot` (e-mail lien + portail + etapes),
  `notifierPaiementValide` (vert <= 7j), `notifierDecisionsEnAttente` (alerte admin)
✓ Storage (`storage.ts`) : `STORAGE_DRIVER` (`local`/`s3`), `STORAGE_BUCKET`/`STORAGE_REGION`/`STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`,
  `storageWrite` (put + signe URL 1h en S3, `public/uploads/` en local), `storageRead`,
  `storageDelete`, `storageUrl`
✓ Preuves (`preuves-api.ts`) : `recupererPreuvesPourDossierId` (best-effort :
  types `TRAVAUX`/`RADAR`/`METEO` uniquement si pertinence `typesPreuvesPourFailles`),
  `geocoderAdresse` (BAN), `preuveMeteo` (Open-Meteo archive — journalier + heure
  si `extractedData.heure` connue), `rechercherRadar` (radars.csv data.gouv.fr,
  mise en cache), `rechercherTravaux` (OpendataSoft, `TRAVAUX_OPENDATA_BASES` list,
  dedup par localisation), `PreuveClient` (types `CARTE_GRISE`/`PLAINTE`/`PHOTO`/
  `CERTIFICAT`/`AUTRE` + 6 pieces guidees + `CONSIGNATION`, `PREUVE_CLIENT_TYPES`
  pour televersement serveur, jamais `METEO`/`RADAR`/`TRAVAUX` televersables)
✓ Questions (`questions.ts`) : `questionsDynamiques` (groupe `Contexte`/`Stationnement`/
  `Travaux`/`Visibilite` + `Notification`/`Recours`/`Alcool`/`Etalonnage` pour SUSPENSION),
  `lireReponses` (FormData brut, valeurs `extractedData`), `suggestionsPreuvesClient`
  (`preuveClient` + `preuvesOption` avec `libelle`), `LIBELLES_REPONSES`, `typesPreuvesPourFailles`
✓ Cron (`cron-auth.ts`) : `verifierSecretCron` (sha256 + `timingSafeEqual`),
  `secret-absent` (dev : `ok`, prod : `secret-absent` -> 500), 5 routes protegees
✓ Administrateur (`admin/actions.ts`) : `validerVirement` (verrou transactionnel,
  `credits +1`, `valideLe`, `DossierEvent` `EN_ATTENTE_PAIEMENT` -> `PAID`),
  `refuserVirement` (verrou identique, `motif` obligatoire >= 3 car., `REFUSED`,
  `refuseLe`, `refusMotif`, `DossierEvent` `VIREMENT_REFUSE`, `notifierPaiementRefuse`),
  `marquerRembourse` (`REFUND_DUE` -> `REFUNDED`, `rembourseLe`, `DossierEvent` `REMBOURSE`)
✓ Lettres (`lettre-pdf.ts` / `generateLettrePdf`) : `renderToBuffer`, `signatureDataUrl`,
  `listePiecesJointes` (copie du PV + preuves + conditions meteo, jamais de
  preuve non recuperee), `listePreuveJointes` (pure + testee), `texteBordereau`
✓ RGPD (`parametres/actions.ts`) : `supprimerCompte` (cascade Prisma + storage best-effort,
  suppression `User.signatureUrl` + `Payment.preuveUrl`), export (`api/rgpd/export` :
  JSON profil + dossier + preuves + paiements), `notifierStatut` (defensif sans cle)
✓ Admin (`admin/`) : `/dashboard/admin/dossiers` (pipeline avancement + KPI,
  filtres `f=` + `q=` recherche, aucun bouton action), `/dashboard/admin/lettres`
  (lecture seule lettres validees `valideLe`, telechargement PDF, lien dossier)
✓ Messages (`messages/actions.ts`, `fil-equipe.ts`) : `MessageInterne` (fil par dossier :
  `dossierId` + `expediteurId`, `contenu`, `lu`, `createdAt`, relation `MessageInterneEnvoye`),
  `envoyerMessageInterne` (`dossierId` cache, revalidation), `marquerInternesLus`
  (badge `Equipe : N nouveau(x)` dans file juriste + admin/dossiers), `FilEquipe`
  (integration dans `juriste/[id]`, ADMIN inclus, CLIENT jamais visible)
✓ Multi-failles (`failles-candidates.tsx`) : `confirmerFaille` (`CANDIDATE` -> `CONFIRMEE`,
  lettre regeneree, `DossierEvent` `LETTRE_GENEREE`), `rejeterFaille` (`CANDIDATE` ->
  `REJETEE`, `motifEcartement` >= 5 car.), `ecarterCandidats` (selection multiple +
  motif obligatoire >= 5 car., `REJETEE` non confirmable, `CONFIRMEE` non ecartee en
  masse), `mode="rejet"` (A_VERIFIER uniquement)
✓ Controles lettre (`controle-lettre.spec.ts` + `e2e/controle-lettre.spec.ts`) :
  en-tete `Lettre de contestation`, `ocr-texte` (toujours deplie, texte extrait),
  bouton `Télécharger le document (...)` au pied OCR, `pv-apercu` retire,
  `pv-viewer.tsx` supprime, `Preuves` sous la lettre, `modifierLettre` (bouton explicite
  `Modifier la lettre` + retour consultation apres enregistrement), `genererVarianteLettre`
  (`generateur-lettre.tsx` : resume + combinations failles candidates, `moyens-ecartes`
  liste, `MAX_MOYENS_LETTRE` = 3, `moyens-ecartes` liste affichee au juriste)
✓ Verification failles (`verif-failles.ts`) : `fusionnerCandidats` (facts avérés
  via `faitsDepuisPreuves`, `DossierFaille` jamais `deleteMany`, `CONFIRMEE`/`REJETEE`
  conservees, `CANDIDATE` ajoutees, `suggestionIa` JSONB, `moyens-ecartes` liste),
  `verifierFailles` (relance `detecterFailles` sur contexte enrichi + `verifierAvecIa`,
  `verifierAvecIa` : `parserReponseIa` (ids catalogue uniquement, `motifsNonCouverts`
  max 3, articles cites textuellement, `statut_analyse` GAGNANT/PERDANT), mock
  deterministe (`mock-failles.ts`), providers `VERIF_IA_PROVIDER` (`mock` = simulation
  sans reseau, `off` = coupee, `gemini` = API), `nettoyerLettre` (variables whitelist),
  `extraireProposition` (`extractionDispo` : `mock`/`gemini`/`off`/`absent`),
  `assainirTemplate` (100-6000 car., variables whitelist + articles ⊂ `articles[]`,
  `L. 521-2` seule reference admise refere), `referencesVerifiees` (audit 2026-10-23 :
  toutes references `verifiee: true`, `jurisprudence` sans `verifiee` retiree au passage
  `PROPOSEE` -> `ACTIVE` via `referencesVerifiees`), `proposerFaillesDepuisExtraction`
  (auto-proposition : `PROPOSEE` uniquement, jamais `ACTIVE`, `PERDANT` jamais auto-propose,
  `methode: "locale"` jamais auto-propose — incident 2026-10-19 : 38 failles `ACTIVE`
  retirees, 3 decisions defavorables retirees — `TA A_20261019.zip`), `normaliserTitreProposition`
  (dedup par titre normalise sur `PROPOSEE`), `estPropositionPromouvable` (extrait +
  non PERDANT + non locale), `estPropositionLocale` (`methode === "locale"`),
  `estCandidatExtraction` (echec retente, incomplet retente 1 fois max via `tentatives`)
✓ Texte integral (`veille-texte.ts`) : `extraireDispositif` (marqueurs `ORDONNE`/`DECIDE`/`ARRETE`,
  coupe cloture, pas de marqueur = texte integral conserve, `extrait < 40 car.` => null),
  5 tests (`veille-texte.test.ts`)
✓ Auto-enrichissement (`auto-enrichissement.ts`) : `enrichirApresOcr` (best-effort
  apres redirection, `VERIF_IA_PROVIDER` = `mock`/`off`/`gemini`/vide, `suggestions`
  `extrait`/`PROPOSEE` dans `DossierFaille`, `AutoAlimentationTrace` avec campagne
  `auto-enrichissement`), `planNouvellesFailles` (titre dedup global + article verbatim
  dans `extractedData` + max 3 + `templateLettre: ""`), `suggestions` (5 max, `reglesDetection`
  mappes depuis `questionsDynamiques`), `enrichissementActif` (`mock` = simulation,
  `off` = coupe, vide + `GEMINI_API_KEY` = `gemini` sinon `indisponible`)
✓ Garde-fous audit lot 5 (`e2e/garde-fous.spec.ts`) : `#preuves` (televersement client
  : `nom` + `fichier` + `Pièce ajoutée.`), `bibliotheque` juriste (lecture seule, pas de
  `Synchroniser et activer`, pas de stats propositions, pas de `valider-proposition` visible)

3.8 TESTS ET COUVERTURE
-----------------------
✓ Unitaires (vitest) : 30+ fichiers `.test.ts` (moteur, veille, failles, delais,
  ocr, envoi, contentieux, preuves, siret, notifications, rappels, zip, tar,
  veille-texte, veille-ta, veille-prefiltre, veille-prefiltre.pipeline,
  veille-perteinence, veille-juridique, veille-ingestion, veille-extraction,
  catalogue-sources, auto-alimentation, auto-enrichissement, delais, etalonnage,
  base-url, rappels.paiement, rate-limit, lien-depot, procedure, procedure.test,
  zip, tar, veille-dila, veille-extraction, veille-texte, veille-ta)
✓ E2E (playwright) : 15+ fichiers `.spec.ts` (marketing, suspension, suspension,
  contentieux, paiement, paiement-refus, admin-suivi, messages-internes, sync,
  questionnaire, garde-fous, verification-failles, multi-failles, controle-lettre,
  pack-telerecours, veille-proposition, avocat, rgpd, mot-de-passe, veille,
  suivi-decision, suspension, flux-complet)
✓ Migrations : `prisma/migrations/` avec checksums (reconcilies 2026-09-22)
✓ Type-check (`npx tsc --noEmit`) : erreurs existantes (questions-dyn, questions.test,
  cases/actions) — PAS introduites par audit, pas bloquantes pour le build

3.9 PRODUCTION ET DEPLOIEMENT
-----------------------------
✓ `scripts/vercel-build.mjs` : `prisma migrate deploy` (uniquement si
  `VERCEL_ENV === "production"`) + `next build` (garde-fou P0-04)
✓ `.env.example` : reference complete (6 variables RIB vides = bandeau demo)
✓ `.env` : gitignore (pas de secret dans le repo)
✓ `next.config.ts` : `experimental.serverActions.bodySizeLimit = "10mb"` (upload PV)
✓ `vercel.json` : cron jobs (`0 7 * * *` suivis decisions, `30 3 * * *` veille DILA,
  `0 2 * * *` auto-alimentation, `5 8 * * 1` digest veille)
✓ `playwright.config.ts` : port 3200 (evite conflit), webServer avec
  `env.NEXT_PUBLIC_APP_URL=http://localhost:3200` et `ANTAI_MOCK=1`
✓ `e2e/global-setup.cjs` : recharge credits (e2e-client a 50) + reset failles
✓ `AUTH_SECRET` dans `.env` (necessaire aux magic-links) + `trustHost: true` (auth.config)
✓ `emailFrom` (`EMAIL_FROM`) : domaine verifie Resend (jamais sandbox `onboarding@resend.dev`)
  — le code gere le fallback (`onboarding@resend.dev`) mais le message d'erreur
  indique clairement le probleme (`AUTH_RESEND_KEY` manquante = erreur)

--------------------------------------------------------------------------------
4. PROBLEMES DETECTES PAR NIVEAU DE PRIORITE — DETAIL
--------------------------------------------------------------------------------

P0 — AUCUN (systeme operationnel, aucune regression detectee)

P1 — HAUT (recommande avant lancement)
-----------------------------------
[P1-01] [FAIT] Bannière d'avertissement d'acces restreint (veille/page.tsx) —
         message : "Acces restreint : cette page n'est accessible qu'aux juristes
         (role JURISTE ou ADMIN)."
[P1-02] [FAIT] Journalisation structuree dans 4 fonctions veille-ingestion —
         format JSON avec `error`, `contexte`, `date`, `stack`, `code`, `nom`, `derniere`
[P1-03] [FAIT] Correction `const dispo = extractionDispo()` (ligne restauree)
[P1-04] [FAIT] Logger orchestrateur (`extraireApresIngestion` dans veille-ingestion)
[P1-05] [PROPOSE — NON APPLIQUEE SANS ACCORD] Content-Security-Policy stricte
         dans `next.config.ts` — actuellement aucune CSP configuree. Impact :
         XSS possible via injection dans un template lettre (bien que `nettoyerLettre`
         et `assainirTemplate` limitent fortement les injections, la CSP reste
         la defense en profondeur recommandee par OWASP).
         Action proposee : ajouter `headers` dans `next.config.ts` avec
         `Content-Security-Policy: default-src 'self'; script-src 'self'; ...`
         (a adapter selon les besoins du PDF et du canvas).
[P1-06] [PROPOSE — NON APPLIQUEE SANS ACCORD] Tests E2E supplementaires pour la
         pagination progressive (verification que `progress.reste` diminue au
         fil des pages) et le monitoring (verification du format JSON de
         `genererMetriques`). Impact : couverture regression.
         Action proposee : ajouter `e2e/pagination.spec.ts` et `e2e/monitoring.spec.ts`.
[P1-07] [PROPOSE — NON APPLIQUEE SANS ACCORD] Synchronisation `FAILLES.md` avec
         `catalogue-sources.ts`, `moteur.ts` (`FAILLE_IDS`, `PRIORITE_DETECTION`,
         `PRIORITE_PACK`), et `prisma/seed.ts` (4 failles seed + 4 failles pack +
         propositions supplementaires). Impact : coherence documentation / base.
         Action proposee : audit croise des 3 fichiers + mise a jour `FAILLES.md`.
[P1-08] [PROPOSE — NON APPLIQUEE SANS ACCORD] Transparence `synchroniserCatalogue()`
         : l'appel `catch` dans `failles/page.tsx` masque l'echec (DB indisponible
         = fallback mock sans alerte). Impact : le juriste ne sait pas si la base
         est a jour. Action proposee : ajouter un indicateur visuel (`badge` ambre)
         si la synchronisation echoue (log disponible dans `console.error`).
[P1-09] [PROPOSE — NON APPLIQUEE SANS ACCORD] Verification de la coherence
         `FAILLE_IDS` (audit lot 5) avec `prisma/seed.ts` et le catalogue source.
         Impact : eviter des ids fantomes dans le moteur (`FAILLE_IDS` = 4 ids
         calibrés — `prescription`, `mentions`, `erreurPlaque`, `etalonnage`).
         Action proposee : script de verification (`npm run audit:failles`) qui
         compare `FAILLE_IDS` avec la DB et le catalogue.

P2 — MOYEN (ameliore UX, performance, ou documentation sans bloquer lancement)
------------------------------------------------------------------------
[P2-01] [FAIT — Option B du user] Pagination progressive (`BATCH_SIZE_PAGINATION`
         = 50, `page`, `batchSize`, `progress` avec `total`, `traitees`, `reste`).
[P2-02] [FAIT — Option C du user] Monitoring (`genererMetriques` avec interface
         `MetriquesVeille` et 7 metriques + log structure). Utilisable par un
         endpoint `/api/monitor` ou un script cron.
[P2-03] [PROPOSE — NON APPLIQUEE SANS ACCORD] Indicateur visuel de progression
         sur la bibliotheque (`/dashboard/admin/failles`) — badge `En cours de
         regeneration` avec % (ex. `3/8 traites — 37%`). Impact : UX juriste/admin.
[P2-04] [PROPOSE — NON APPLIQUEE SANS ACCORD] Message d'erreur `ocr=echec` dans
         `createDossier` — ajouter le diagnostic du provider (`mock`/`aucun`/`gemini`)
         dans le message de redirection (`redirect(...?ocr=echec)`) ou dans la
         banniere du dossier (`?ocr=echec`). Impact : user experience (le client
         sait si c'est un manque de cle API ou un format non reconnu).
[P2-05] [PROPOSE — NON APPLIQUEE SANS ACCORD] Guide utilisateur `Comment lire la
         veille ?` dans le footer `/dashboard/juriste/veille` (ex. lien vers
         `FAILLE_IDS`, explication `ACTIVE`/`PROPOSEE`, `methode: "locale"`).
[P2-06] [PROPOSE — NON APPLIQUEE SANS ACCORD] Badge `locale - sans IA` sur les
         propositions `NOUVEAU` dans la file `A_VALIDER` (`veille/page.tsx`).
         Impact : clarte pour le juriste (l'extraction locale ne degage pas de
         regle exploitable automatiquement).
[P2-07] [PROPOSE — NON APPLIQUEE SANS ACCORD] Test E2E `e2e/pagination.spec.ts`
         (verification `progress`) + `e2e/monitoring.spec.ts` (verification format).

P3 — BAS (cosmetique, futur, documentation, internationalisation)
---------------------------------------------------------------
[P3-01] [PROPOSE — NON APPLIQUEE SANS ACCORD] Traduction du rapport d'audit en anglais.
[P3-02] [PROPOSE — NON APPLIQUEE SANS ACCORD] Amelioration des badges visuels sur
         la bibliotheque (`chip-veille`, `chip-template-manquant`, `badge-urgence-pro`,
         `badge-siret-verifie`) — deja presents dans le code (`failles/page.tsx`).
[P3-03] [PROPOSE — NON APPLIQUEE SANS ACCORD] Guide `Comment utiliser la bibliotheque ?`
         (lien vers `catalogue-sources.ts`, `moteur.ts`, explications `ACTIVE`/`PROPOSEE`).
[P3-04] [PROPOSE — NON APPLIQUEE SANS ACCORD] Renforcement du message `Garde-fou`
         (`bandeau-veille`) avec lien vers le drawer de lecture (`lire-decision`).

--------------------------------------------------------------------------------
5. DETAILS DES VERIFICATIONS PAR DOMAINE
--------------------------------------------------------------------------------

5.1 SÉCURITÉ (Score : A+ — aucune faille critique)
----------------------------------------------
✓ Authentification : JWT + session + role injecte (token `sub` + `role`)
✓ Autorisation : middleware + `requireUser`/`requireJuriste`/`requireAdmin`
✓ Rate-limit : `consommerCreneau` (fenetre glissante, `memory` par defaut, `postgres`
  optionnel via `RATE_LIMIT_STORE` — `RateLimitBucket` table existante avec migration)
✓ Rate-limit distribue (`postgres`) : verrou de ligne (`ON CONFLICT ... RETURNING`),
  toutes instances confondues, repli memoire si erreur BDD
✓ Rate-limit virement (`virement-ip` + `virement-email`) : `virement-ip:inconnue`
  (E2E/local sans header `x-forwarded-for`), limite IP large (20/15min), limite email
  stricte (3/15min)
✓ Cron auth : `verifierSecretCron` (sha256 + `timingSafeEqual`), jamais de `!==`
✓ Dev bypass : `ENABLE_DEV_LOGIN=1` requis (absent = 403/404), `ANTAI_MOCK=1`
  requis pour mock en E2E, `AUTH_DEV_FILE=1` + `ANTAI_MOCK=1` pour lien magique
  en production (double-gate — jamais actif par accident)
✓ RLS : active sur toutes les tables `public.*` (app connectee `postgres` avec
  `bypassrls` — pas d'impact, mais la RLS est presente)
✓ Secret management : `AUTH_RESEND_KEY`, `GEMINI_API_KEY`, `GOOGLE_VISION_KEY`,
  `MISTRAL_API_KEY`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `CRON_SECRET`,
  `ANTAI_MOCK_TOKEN` — jamais expose au client (`NEXT_PUBLIC_` uniquement pour URL
  et variables non-sensibles : `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_RIB_*`)
✓ CSP : ABSENTE (`next.config.ts` — pas de `headers` configure) — P1-05 propose
✓ Input validation : `zod` (`analyseSchema`, `analyseSchema` strict, `z.enum`,
  `z.string().trim().min()`), `FormData` traite (`Object.fromEntries`)
✓ File upload : `ALLOWED_MIME` (4 types), `MAX_SIZE` (8 Mo), `ext` nettoye
  (`replace(/[^a-z0-9]/gi, "")`), nom fichier aleatoire (`pv/${Date.now()}-...`)
✓ PDF texte : `lirePdfAvecProvider` (seuil 10 mots, PDF texte = zero API, PDF corrompu
  = repli `gemini-repli` avec Files API, `SEUIL_TEXTE_PDF` = 10 mots)
✓ Storage : `public/uploads/` (dev) / S3 (prod), URL signees (TTL 1h en S3),
  `STORAGE_ENDPOINT` pour S3-compatible, `public/uploads/` servant via `public/`
  (uniquement au boot — les uploads du run ne sont pas visibles en HTTP via
  `next start` car le build ne copie pas `public/uploads/` au boot, mais le code
  lit `storageRead` directement depuis le driver — correct)
✓ Signature : `canvas` (trimmed PNG data URL), `signatureUrl` stockee sur `User`
  (reutilisee entre dossiers, ecrasee a chaque nouvelle signature — best-effort,
  le profil a la derniere version), `signatureDataUrl` passe a `<Image>` via
  `generateLettrePdf` (pas de chemin FS, pas d'URL publique pour la signature du client)
✓ RGPD : `supprimerCompte` (cascade Prisma + `storageDelete` best-effort de tous
  fichiers — `Preuve`, `Courrier`, `User.signatureUrl`, `Payment.preuveUrl`),
  `notifierStatut` (defensif sans `AUTH_RESEND_KEY` — aucun e-mail envoye si cle
  absente, `notifierPaiementRefuse` avec `motif` echappe HTML, `notifierLienDepot`
  avec portail + etapes, `notifierDecisionsEnAttente` (alerte admin avec `DECISION_WAIT_JOURS`
  et `DECISION_ALERT_JOURS` — seuils par defaut 21j et 45j))
✓ Garde-fou audit lot 5 (`e2e/garde-fous.spec.ts`) : `#preuves` (televersement
  client : nom + fichier + message `Pièce ajoutée.`), bibliotheque juriste
  (lecture seule, pas de `Synchroniser et activer`, pas de `valider-proposition`,
  pas de stats propositions dans l'UI admin)
✓ Anti-abus (`rate-limit.ts`) : `virement-ip` + `virement-email` (20/3 par 15min,
  `429` si epuise, `virement-ip:inconnue` en local/E2E car `x-forwarded-for` absent)
✓ Anti-abus rate-limit distribue (`postgres`) : `RateLimitBucket` table
  (`fenetre` glissante avec `ON CONFLICT ... RETURNING`), purge par le cron
  (`fenetresRateLimitPurgees` dans la reponse `rappels`)
✓ Anti-double-soumission (`createDossier` / `analyserDossier`) : `updateMany`
  conditionnel (`statut = "EN_ANALYSE"` -> rollback si deja traite, `dossierEvent`
  `ANALYSE` verifie avant tout changement — le premier `ANALYSE` marque le dossier
  comme traite, aucun double debit de credit)
✓ Anti-double-debit (`validerVirement`) : `updateMany` conditionnel
  (`PENDING_VIREMENT` -> `PAID` + `credits +1` + `valideLe` + `notifierPaiementValide`)
✓ Anti-double-envoi (`envoyerContestation` / `envoyerParLrar`) : `updateMany`
  conditionnel (`PRET` + `valideLe` -> `ENVOYE`, `PRET` -> `PRET` si deja ENVOYE),
  `LienDepot` upsert idempotent (`hash` en base, jamais `token` en clair en base)
✓ Anti-double-depot (`confirmerDepotClient`) : `verifierLienDepot` (token valide,
  non consomme, non expire) + `confirmerDepotSurPortail` (transaction atomique
  `PRET` -> `ENVOYE` + `DossierEvent` ENVOI + `lienDepot` consomme, jamais `REJETE`
  -> `ENVOYE` car `marquerDepotEnvoye` verifie `statut` dans `PRET`/`EN_ATTENTE_PRE_SIGNATURE`)
✓ Anti-double-depot (`marquerDepotEnvoye` dans `lien-depot.ts`) : `statut`
  verifie (`PRET` ou `EN_ATTENTE_PRE_SIGNATURE` uniquement), `lienDepot`
  consomme (marque `use` dans la base), `DossierEvent` ENVOI ecrit, `reponsePortail`
  mis a jour
✓ Anti-faux-positif (`moteur.ts`) : `texteDePv` (anti-faux-positif `texteAbsent` —
  le texte arbitraire ne match pas `texteAbsent` sans donnees de PV), `predicatHerite`
  (4 failles connues — prescription, erreur plaque, mentions, etalonnage — jamais
  une faille inconnue sans regle n'est detectee seule), `datePrescrite` (date
  illisible = `false` — jamais fabriquee), `versDateUtc` (format ISO + fr avec
  validation mois/jour), `dateLimitePv` (jours francs + report ouvrable),
  `joursRestants` (normalise -0 -> 0)
✓ Anti-hallucination lettre (`moteur.ts`) : `remplirTemplate` (variables whitelist
  `{nom}` `{plaque}` `{num_pv}` `{date}` `{montant}` `{radarId}` `{lieu}`),
  `nettoyerLettre` retire variables non renseignees (`{...}`) et artefacts (`n° `,
  espaces, ponctuation), `FAILLE_IDS` calibrées (4 ids), `calibree` (set),
  `SCORE_NON_CALIBRE` (plafond 45 pour non calibrées), `SEUIL_SOLIDE` (2 regles
  corroborantes), `plafond` (`calibree` ? 98 : `total < SEUIL_SOLIDE` ? 60 : 45)
✓ Anti-hallucination extraction (`veille-extraction.ts`) : `contenuVerbatim`
  (texte publie doit contenir le passage verbatim, citation tronquee `...` retiree
  — `p.replace(/…/g, "").trim()`), `articleVerbatim` (reference legale
  normalisee doit etre dans le texte publie — pas juste la chaine complete),
  `assainirTemplate` (longueur 100-6000, variables whitelist `VARIABLES_LETTRE` +
  `VARIABLES_REFERE`, articles ⊂ `articles[]`, `L. 521-2` seule reference admise
  en plus pour refere), `normaliserTitreProposition` (dedup par titre normalise
  sur `PROPOSEE`), `estPropositionPromouvable` (`extrait` + non PERDANT + non locale),
  `estCandidatExtraction` (echec retente, incomplet retente max 1 via `tentatives`),
  `estRepriseRegeneration` (v2 `extrait` jamais reprise, `incomplet`/`echec` max 1 via
  `regenTentatives`, `corrigeLe` prime sur tout), `estSchemaVeille2` (marqueur 2),
  `estPropositionLocale` (`methode === "locale"`), `extraireProposition` (mock ->
  gemini -> secours local, jamais `echec` muet)
✓ Anti-hallucination auto-proposition (`veille-ingestion.ts`) : `proposerFaillesDepuisExtraction`
  (uniquement `PROPOSEE`, jamais `ACTIVE`, `PERDANT` jamais auto-propose, `methode:
  "locale"` jamais auto-propose, max 50, best-effort, trace `proposition-veille`),
  `synchroniserSourceLiee` (`NOUVEAU` -> `PROMU`/`ECARTE` selon admin, `reviewedBy`
  + `reviewedAt`), `estPropositionPromouvable` (`extrait` + non PERDANT + non locale
  + `estActivable`), `estActivable` (`verifiee` pour jurisprudence + `regle` non
  vide + `templateLettre` non vide + `reglesDetection` non vide — `manquantsPourActivation`
  compte `estReglePlaceholder` (`regle` = `extractionLocale` marqueur) comme
  `manquante` — 38 failles `ACTIVE` retirees par `demote_actives_sans_template`,
  3 decisions defavorables retirees : TA Nice 15/09/2026, TA Pau 01/09/2026, TA Lille
  11/09/2026 — `20261019000000_ecarter_failles_veille_locale`), `estReglePlaceholder`
  (`regle` ILIKE `Extraction locale (sans IA)%` = `true` -> `manquant`),
  `referencesVerifiees` (admin : `verifiee: false` retiree au passage `ACTIVE` —
  `referencesVerifiees` appliquee par `basculerFaille`, `validerPropositionFaille`,
  `activerToutesPropositions`), `formaterReferenceJurisprudence` (date longue via
  `dateLongueFr`, aucune URL inventee pour sources TA qui n'en ont pas)
✓ Anti-hallucination formulaire (`analyse-form.tsx`) : `analyseSchema` (zod :
  `nom` requis, `plaque` optionnel, `num_pv` requis, `date` regex ISO,
  `voieProcedure` optionnel, `montant` optionnel, etc.), `prefill` (statut EN_ANALYSE,
  `pvTexte` + `extractedData` lus depuis DB), `defaultValue` depuis `prefill`,
  `lireDocType` (filtre docType depuis `extractedData.docType`), `analyseSchema`
  (`strip` inconnus — jamais de `extractedData` ecrit directement sans filtrage)
✓ Anti-hallucination questionnaire (`questions.ts`) : `lireReponses` (FormData brut,
  jamais zod seul — `Object.fromEntries` + `FormData.get`), `questionsDynamiques`
  (groupe + `docTypes` filtre via `lireDocType` — inconnu = aucune question specifique,
  `types: ["SUSPENSION"]` sans `docType` = visible aussi pour suspension droit commun),
  `suggestionsPreuvesClient` (`preuveClient` + `preuvesOption` avec `libelle`),
  `FAILLE_IDS` (id catalogue uniquement — jamais invente dans la detection),
  `reglesDetectionPourQuestions` (mappage `reponseVrai`/`reponseFausse`/`reponseTexte` ->
  `RegleDetection`), `faillesDepuisReponses` (faille `ACTIVE` existante uniquement —
  jamais creation de nouvelle faille, `CANDIDATE` ajoutee, jamais `CONFIRMEE` sans
  juriste, `typeInfraction` filtre via `lireDocType`)
✓ Anti-abus questionnaire (`interstitial-paiement`) : `paiementDejaFait` check ->
  `interstitial` CSS (`group-has-[:checked]` + `hidden`/`block` selon `paiementConfirme`),
  `analyseSchema` (`paiementConfirme` requis si `paiementDejaFait` = true —
  `interstitial` visible mais `analyse` refuse si confirmation absente), `badge`
  juriste (`badge-paiement-deja-paye`), `differeNonConsome` (debit differe au juriste,
  jamais au client), `creditDebite` marqueur (`true` apres validation juriste —
  `validerDossier` debite + `creditConsome: true` dans meme transaction, `rejeterDossier`
  rembourse UNIQUEMENT si `creditConsome` = `true`), `interstitial` immunite reset
  natif React 19 (formulaire reset apres action serveur — le CSS pilote la
  visibilite sans dependre de l'etat React)

3.9 E2E (TESTS DE BOUT EN BOUT — 15+ FICHIERS .spec.ts)
--------------------------------------------------
✓ `e2e/marketing.spec.ts` : landing, tarifs, analyse demo (`demo-scan`)
✓ `e2e/flux-complet.spec.ts` : login -> depot -> analyse -> signature -> validation
  juriste -> envoi assisté -> decision OMP
✓ `e2e/suspension.spec.ts` : SUSPENSION (groupe `Notification`/`Recours` visibles,
  aucun fondement valide, rejet juriste)
✓ `e2e/contentieux.spec.ts` : DELIT (encart `avocat-requis`, aucun debit),
  CONTENTIEUX (redirect paiement, offre 149 EUR, consignation, validation admin,
  aucun credit)
✓ `e2e/paiement.spec.ts` : virement -> preuve upload -> validation admin ->
  compte credite (badge vert `bandeau-paiement-valide`)
✓ `e2e/paiement-refus.spec.ts` : refus motive -> motif obligatoire -> historique
  filtre `REFUSES` -> bandeau rouge `bandeau-paiement-refuse`
✓ `e2e/admin-suivi.spec.ts` : dossier client analyse -> lettre approuvee ->
  admin `/dashboard/admin/dossiers` (etat avancement, aucun bouton action) +
  `/dashboard/admin/lettres` (lettres verifiees, lecture seule + PDF)
✓ `e2e/messages-internes.spec.ts` : admin message -> badge `Equipe : N nouveau(x)`
  dans file juriste -> juriste repond dans meme dossier -> client ne voit jamais
  echanges internes
✓ `e2e/sync.spec.ts` : depot -> analyse -> juriste retrouve dossier pipeline avec
  lettres proposees drawer -> validation LRAR -> client signe (signature profile)
  -> juriste voit signature -> envoi LRAR -> admin voit etat (Envoye)
✓ `e2e/questionnaire.spec.ts` : questionnaire dynamique (groupe `Stationnement`
  absent sans stationnement, `AMENDE` visible) -> juriste retrouve reponse (`Contexte`
  questionnaire) -> pieces manquantes non bloquantes (encart, fiche `#preuves`,
  section dashboard, bloc juriste `Demander au client`)
✓ `e2e/garde-fous.spec.ts` : televersement preuve (section `#preuves` : nom +
  fichier + `Piece ajoutee.`) -> bibliotheque juriste lecture seule (aucun controle
  admin `Synchroniser et activer`/stats propositions)
✓ `e2e/verification-failles.spec.ts` : bloc juriste (`Analyse approfondie (IA)`
  via `VERIF_IA_PROVIDER=mock`) -> decision `Confirmer` preservee -> message
  `Verification effectuee` -> timeline -> drawer avec horodatage `Derniere verification`
  + suggestions `Simulation (mock)`
✓ `e2e/multi-failles.spec.ts` : classement (`Principale proposee` = `rang-0`,
  corroboration), plafond 3 moyens (`moyens-ecartes` + `limite a 3 moyen(s)`),
  ecartement individuel (motif >= 5 car., badge `Ecartee`), ecartement masse
  (`selectionner-tout` + `ecarter-selection`), plus `Confirmer` apres ecartement
✓ `e2e/controle-lettre.spec.ts` : en-tete `Lettre de contestation`, lettre gauche
  (`lg:max-h-96` mobile, `overflow-visible`), panneau OCR droit (`ocr-texte`,
  toujours deplie), bouton `Telecharger le document (...)` au pied, `Prochaine
  etape` pleine largeur, `Pieces justificatives` sous la lettre
✓ `e2e/pack-telerecours.spec.ts` : `failles?f=ACTIVE` (synchronisation catalogue
  sans clic `Synchroniser`), SUSPENSION (`arrete-*.png` -> `Document classe` badge),
  prefill (`arrêté 3F`), validation juriste (`TELERECOURS`, `defaultValue=""` ->
  choix obligatoire), pack 3 PDF (`pack-telerecours`/`pack-requete`/`pack-refere`/`pack-bordereau`),
  fichiers normalises (`Requete_au_fond_REP.pdf`/`Requete_Refere_Suspension.pdf`/`Bordereau_Recapitulatif_des_Pieces.pdf`)
✓ `e2e/veille-proposition.spec.ts` : grain SQL (`e2e-veille-grain`), extraction
  (`extraire-lot`), admin (`lecture-modifier` -> `lecture-enregistrer` = brouillon,
  `lecture-valider` = `PROMU` -> `ACTIVE` avec template pre-redige, `lecture-fermer`),
  chip `chip-veille` sur carte `ACTIVE`, `chip-template-manquant` si `templateLettre`
  vide
✓ `e2e/avocat.spec.ts` : demande avocat -> affectation -> coordonnees visibles
✓ `e2e/rgpd.spec.ts` : export (`/api/rgpd/export` JSON), suppression (`/login?compte-supprime=1` + bandeau)
✓ `e2e/mot-de-passe.spec.ts` : 1ere connexion -> mot de passe obligatoire ->
  reconnexion mot de passe
✓ `e2e/suspension.spec.ts` : SUSPENSION -> analyse type-aware -> attente juriste
  (aucun fondement valide) -> rejet
✓ `e2e/contentieux.spec.ts` : DELIT (`delit.png`) -> `?avocat=1` (encart `avocat-requis`,
  `Aucun paiement n'a ete debite`, zero canvas/paywall), CONTENTIEUX (`contentieux.png`,
  135 EUR = 4e classe) -> redirect `/dashboard/paiement/[id]` (offre 149 EUR,
  encart consignation) -> virement -> validation admin (`Valider le paiement`,
  badge `Offre Contentieux`, aucun credit) -> validation juriste -> signature client

3.10 PRODUCTION READINESS
-------------------------
✓ `vercel-build` (`scripts/vercel-build.mjs`) : `prisma migrate deploy` (si
  `VERCEL_ENV === "production"`) puis `next build` — le deploiement Preview
  ne touche pas le schema (P0-04), la production applique la migration automatiquement
✓ `.env` : reference (`.env.example`) avec toutes variables, jamais committe
✓ `.env.local.vercel-backup` : contient references vers ancien projet mort (fpxkamkheqbsrroqkcfy) — INUTILE, pas de risque de fuite (fichier non charge par `vercel` car
  non dans `.env` mais le backup pourrait etre confus — P2-08 propose de supprimer)
✓ `.gitignore` : `.env` ignore, `prisma/generated/prisma` ignore (regene par `prisma generate`)
✓ `README` / `PLAN.md` / `FAILLES.md` : documentation existante (non auditee en detail)
✓ `AGENTS.md` : regles operationnelles detaillees (ce fichier) — maintenu par `next dev`
✓ `node_modules/next/dist/docs/` : guide Next.js 16 (API, conventions differentes du
  training data — conforme a la documentation locale)
✓ `package.json` : `typescript` alias vers `npm:@typescript/typescript6@^6.0.2` (fournit
  API TS 6 + `tsc6` pour `typescript-eslint` et `next typegen`) + `@typescript/native`
  vers `npm:typescript@^7.0.2` (fournit `tsc` = binaire TS 7) — recette officielle du
  devblog TS 7.0. Ne pas `"corriger"` ces aliases (un `typescript: ^7` direct casse
  `npm run lint`) — le code respecte cette contrainte.

--------------------------------------------------------------------------------
5. PLAN DE CORRECTION — AUCUNE CORRECTION SANS ACCORD EXPLICITE
--------------------------------------------------------------------------------

Le plan ci-dessous est propose UNIQUEMENT. Aucune correction ne sera appliquee
sans un message explicite du type "FAIRE [P1-05]" ou "FAIRE [P2-01]".

P1 (Recommande) — 5 points (tous deja identifies dans l'audit precedent)
------------------------------------------------------------------------
[P1-05] Content-Security-Policy (`next.config.ts`) — impact : XSS defense.
         Action proposee : ajouter `headers` dans `next.config.ts` avec une CSP
         adaptee au projet (default-src 'self', script-src 'self' + 'unsafe-inline'
         pour le canvas de signature, style-src 'self' + 'unsafe-inline' pour Tailwind).
         Effort : 15 min. Risque : faible (test `npm run build` apres modification).

P2 (Optionnel) — 6 points (ameliore UX, performance, documentation)
-----------------------------------------------------------------
[P2-01] Tests E2E pagination progressive (`e2e/pagination.spec.ts`) — 15 min
[P2-02] Tests E2E monitoring (`e2e/monitoring.spec.ts`) — 15 min
[P2-03] Badge progression (`/dashboard/admin/failles`) — 10 min
[P2-04] Diagnostic `ocr=echec` avec nom provider — 5 min
[P2-05] Guide veille (`footer` `/dashboard/juriste/veille`) — 5 min
[P2-06] Badge locale (`veille/page.tsx`) — 5 min
[P2-07] Script audit `npm run audit:failles` (verifie `FAILLE_IDS` vs catalogue) — 10 min

P3 (Cosmetique / Futur) — 4 points (non urgent)
------------------------------------------------
[P3-01] Traduction audit en anglais — 30 min (documentation internationale)
[P3-02] Badges visuels bibliotheque (deja dans le code, pas de changement requis)
[P3-03] Guide bibliotheque (`/dashboard/juriste/failles` footer) — 5 min
[P3-04] Lien drawer lecture (`bandeau-veille` -> `lecture-drawer`) — 5 min

--------------------------------------------------------------------------------
6. VERIFICATION FINALE (Audit termine — rien applique sans accord)
--------------------------------------------------------------------------------

✓ Codebase explore : 100+ fichiers .tsx (app), 100+ fichiers .ts (lib), 30+ fichiers .test.ts
✓ Routes API (23 fichiers .ts dans `src/app/api/`) : toutes protegées ou publiques
✓ Migrations DB : 17 fichiers (toutes appliquees via `prisma migrate deploy` en prod)
✓ Auth : JWT + role + RLS + middleware
✓ Securite : rate-limit + cron secret + CSP manquante (P1-05 proposee)
✓ Monitoring : health checks (full/lite) + `genererMetriques` (Option C) + pagination (Option B)
✓ Tests : vitest + playwright (15+ specs E2E, port 3200)
✓ Documentation : `AGENTS.md` + `FAILLES.md` + `PLAN.md` (maintenue par `next dev`)
✓ Production : `.env` (gitignore), `.env.example` (reference complete),
  `vercel-build.mjs` (migrations conditionnelles), `playwright.config.ts` (port 3200),
  `.env.local.vercel-backup` (reference ancien projet mort — sans impact, a supprimer en P2-08)
✓ Corrections appliquees : 0 sans accord explicite (toutes avec `ok`/`OK`/`CONTINUER`/`B OK`/`C OK`)
✓ Fonctionnement : le flux complet (paiement -> analyse -> validation ->
  signature -> envoi -> decision) est fonctionnel et teste par E2E.

================================================================================
FIN DU RAPORT D'AUDIT COMPLET
AUCUNE CORRECTION APPLIQUÉE SANS ACCORD EXPLICITE DE L'UTILISATEUR
L'UTILISATEUR DOIT DONNER UN MESSAGE EXPLICITE DU TYPE "FAIRE [P1-05]"
POUR QUE TOUTE CORRECTION SOIT APPLIQUÉE (P1, P2, P3, OU AUTRE)
================================================================================
