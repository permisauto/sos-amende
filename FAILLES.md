# Référentiel des failles juridiques (inventaire interne)

Fichier de travail **interne au repo** (non affiché sur le site). Il recense
toutes les failles / motifs de contestation : implémentées, signalées au
juriste, et prévues mais non encore rédigées.

> ⚠️ **Garde-fou produit** : ce document est un **inventaire**, pas un contenu
> juridique. Les articles ci-dessous proviennent uniquement des templates
> existants (seed). Toute nouvelle faille doit être rédigée **et validée par un
> juriste** avant d'être activée (`statut: ACTIVE`). Ne jamais inventer un
> article de loi.

Sources de vérité à garder synchronisées :
- `prisma/seed.ts` → table `FailleJuridique` (les 4 failles AMENDE)
- `src/lib/moteur.ts` → `FAILLE_IDS`, `detecterFailles` (règles + ordre de priorité), `scoreFaille` — **audit lot 5** : `FAILLE_IDS` contient **exactement les 4 ids seedés** ; les 6 ids « questionnaire » fantômes (travaux-signalisation, meteo-visibilite, cession-vehicule, conducteur-different, paiement-deja-effectue, adresse-erronee) — **absents de toute base (dev/prod)** — ont été retirés de `FAILLE_IDS`, `mock-failles.ts` (`isHistorique`) et `PREUVES_PAR_FAILLE` (`preuves-api.ts`). Un test Vitest verrouille cette synchronisation.
- `src/lib/catalogue-sources.ts` → `CATALOGUE_SOURCES` (propositions sourcées §H)
- Base live : table `FailleJuridique` (bibliothèque juridique unifiée, auto-alimentation PROPOSEE, import/export JSON)

---

## A. FAILLES AMENDE — IMPLÉMENTÉES (4, seedées, `ACTIVE`)

| # | Id (FAILLE_IDS) | Titre | Article | Source | Déclencheur (règles `reglesDetection`) |
|---|---|---|---|---|---|
| 1 | `faille-prescription-1-an` | Prescription de l'action publique (1 an) | art. 9 du Code de procédure pénale | Code de procédure pénale | `{type: "datePrescrite"}` |
| 2 | `faille-mentions-obligatoires` | Défaut de mentions obligatoires sur l'avis de contravention | art. R. 246-1 et s. du Code de la route | Code de la route | `{type: "champAbsent", champ: "numTelePaiement"}` **ou** `{type: "champAbsent", champ: "cle"}` |
| 3 | `faille-erreur-plaque` | Erreur de plaque d'immatriculation | art. 530-1 du Code de procédure pénale | Code de procédure pénale | `{type: "plaqueIncorrecte"}` |
| 4 | `faille-certificat-etalonnage` | Demande de communication du certificat d'étalonnage du cinémomètre | art. L. 130-3 du Code de la route + arrêté du 27 mars 2007 | Code de la route / Arrêté du 27 mars 2007 | `{type: "etalonnageExpire"}` (échéance expirée le jour de l'infraction : registre admin `RadarCalibration` en priorité, sinon date de vérification **lue sur le PV** — `dateVerificationAppareil`, rubrique « Appareil de contrôle homologué » — échéance +1 an, exception +2 ans des postes fixes récents) |

**Variables disponibles dans les templates** : `{nom}`, `{plaque}`, `{num_pv}`.
**Statut** : templates présents mais **à relire par un juriste avant lancement public**
(risque n°4 du PLAN).

**Priorité du moteur** (`detecterFailles`) : prescription 1 an > erreur de
plaque > mentions obligatoires > certificat d'étalonnage. **Plus aucun
« fallback étalonnage » fabriqué** : sans indice (règle qui matche), aucune
faille n'est retenue et le dossier passe en attente (le juriste décide).

---

## B. FAILLES AMENDE — SIGNALÉES AU JURISTE (pas de lettre automatisée)

Signaux du questionnaire ciblé (formulaire d'analyse). Ils ne génèrent
**aucune lettre** : ils sont transmis au juriste comme contexte (aucun article
inventé). Le juriste décide du fondement ou rejette. Affichage :
`juriste/[id]/page.tsx` (« Contexte (questionnaire) »).

| Signal (`extractedData`) | Libellé client | Comportement |
|---|---|---|
| `paiementDejaFait` | Amende déjà payée | Transmis au juriste |
| `vehiculeCede` | Véhicule cédé avant l'infraction | Transmis au juriste |
| `vehiculeVole` | Véhicule volé / plaque usurpée | Transmis au juriste |
| `conducteurDifferent` | Un autre conducteur était au volant | Transmis au juriste |
| `plaqueIncorrecte` | Plaque du PV différente de la mienne | Transmis au juriste **et** détecté par la règle `plaqueIncorrecte` |

### Questionnaire ciblé dynamique (N1 + N2) — en place depuis 2026-10-03

Registre unique : **`src/lib/questions.ts`** (`QUESTIONS_CIBLEES`). Chaque
question porte `cle` (champ du `FormData`), `champ` (`extractedData`),
`libelle` (affiché tel quel au client **et** au juriste), `groupe`, `types`
(AMENDE/SUSPENSION), `natures` (nature du document qui l'affiche) et `preuve`
(N2).

- **Affichage** : `questionsPour({ type, texte })` — les groupes affichés
  dépendent de la **nature du document scanné** (`naturesPv()` sur
  `Dossier.pvTexte`, motif et lieu saisis), **jamais des règles des failles** :
  un groupe vide est impossible (voir l'échec du 2026-10-01 ci-dessous).
  `plaqueIncorrecte` reste posée hors registre (case historique).
- **Groupes** : AMENDE → *Contexte* (5 questions historiques) + *Stationnement*
  + *Travaux et signalisation* + *Visibilité* ; SUSPENSION → *Notification de la
  décision* + *Alcool / stupéfiants* (si le texte parle d'alcool) + *Recours
  engagés*. Le questionnaire n'affiche **jamais** les questions de l'autre type.
- **N1 — contexte juriste** : `lireReponses(formData)` n'écrit que les cases
  cochées dans `extractedData` (jamais de `false` inutile), affichées dans
  « Contexte (questionnaire) » de `juriste/[id]` (libellés partagés
  `LIBELLES_REPONSES`).
- **N2 — preuves externes** : `preuvesPourReponses(data)` s'ajoute aux types
  déclenchés par les failles détectées (`typesPreuvesPourFailles`) dans
  `analyserDossier` : `travaux_présents` / `stationnementGene` → `TRAVAUX`,
  `conditions_meteo` → `METEO`. Best-effort, jamais bloquant.
- **N3 — réponse → candidature de faille** : **pas encore** (décision du
  2026-10-03). En attente du tableau d'arbitrage juridique : faille liée,
  pièce de corroboration exigée, poids réel dans le score, quelles cases
  restent de simples signaux. Aucune règle `champPresent` n'a été ajoutée.

> ⚠️ **Ne pas transformer ces signaux en règles de détection.** Une case
> cochée ne doit jamais générer un fondement : le client coche, le juriste
> décide. C'est le garde-fou anti-hallucination. État vérifié le 2026-10-01 :
> sur les 20 failles `AMENDE` `ACTIVE`, **seules** `numTelePaiement` et `cle`
> (`champAbsent`) et `plaqueIncorrecte` lisent un champ du formulaire ; les
> autres signaux sont **volontairement** hors moteur. Les propositions de la
> section C (stationnement) ne s'appuient que sur des règles **texte/OCR**,
> jamais sur une case cochée : le lien « case → faille » est N3, en attente
> d'arbitrage juridique.

> ⚠️ **Questionnaire dynamique : supprimé (2026-10-01), refait autrement
> (2026-10-03).** L'ancien générateur (`src/lib/questionnaire.ts` +
> `/api/questionnaire`) transformait les règles `ACTIVE` en cases affichées au
> client : en pratique la base ne contient que des `texteContient`/`texteAbsent`/
> `datePrescrite`/`etalonnageExpire`/`champAbsent`/`plaqueIncorrecte`, donc le
> bloc rendu était **vide à l'écran**. Le registre actuel (`src/lib/questions.ts`)
> ne dépend **plus des failles** mais de la **nature du document** : le bloc ne
> peut pas être vide. Le lien « réponse → faille » (l'ancien objectif
> `champPresent`) reste une décision de **fond juridique** en attente (N3).

---

## C. FAILLES AMENDE — PRÉVUES, NON RÉDIGÉES

Issues du PLAN §5 (« 5 fondements de base : paiement, cession, vol/usurpation,
erreur matérielle, amnistie »). Les quatre premiers sont couverts par A ou B
(signaux). Manque :

| Motif | Statut | Article | Template |
|---|---|---|---|
| Amnistie | **À saisir par un juriste** | À déterminer par le juriste | Vide — à rédiger |

### Propositions stationnement — sourcées et lettrées (2026-10-03)

Le catalogue (`src/lib/catalogue-sources.ts`) porte 3 propositions de
stationnement importées en `PROPOSEE` : `faille-stationnement-panneau`,
`faille-stationnement-travaux`, `faille-stationnement-lieu`. Livrées
initialement `aCompleter` (aucun fondement inventé), elles ont été **complétées
à la demande** pour que « Synchroniser et activer » ne soit plus bloqué :

- **articles empruntés aux failles voisines déjà sourcées** (panneau et travaux
  → `art. R.411-25 CR ; L.2213-1 CGCT`, comme `faille-panneau-non-conforme` ;
  lieu → `art. 429, 537 et 43 CPP`, comme `faille-lieu-imprecis`) — aucun
  article nouveau n'est inventé ;
- **lettres rédigées à partir des règles dégagées** (perceptibilité du panneau,
  gêne imputable au chantier, lieu non identifiable) ;
- `jurisprudence` reste **vide** : aucune décision n'est fabriquée (le drapeau
  `verifiee` des autres entrées continue de s'appliquer).

| Piste | Règle de détection (texte/OCR uniquement) | Fondement |
|---|---|---|
| Panneau d'interdiction non perceptible (masqué, illisible, fin de zone) | `texteContient "stationnement"` | `art. R.411-25 CR ; L.2213-1 CGCT` |
| Stationnement en zone de travaux (gêne imputable au chantier) | `texteContient "travaux"` | `art. R.411-25 CR ; L.2213-1 CGCT` |
| Place de stationnement non identifiée sur l'avis | `champAbsent lieu` | `art. 429, 537 et 43 CPP` |

**Aucune entrée du catalogue ne porte plus `aCompleter`** (test
`catalogue-sources.test.ts`) : le bouton « Synchroniser et activer » bascule
donc toutes les propositions en `ACTIVE` en un clic. Les garde-fous restent en
place pour les propositions hors catalogue (promotions de veille, créations
manuelles) : `estActivable` / `messageActivationBloquee` refusent l'activation
sans `regle` **et** `templateLettre`, `synchroniserCatalogue` ne réécrit jamais
une proposition déjà en base marquée `aCompleter`, `detecterMisesAJourCatalogue`
et `appliquerMiseAJourCatalogue` les ignorent, la démo publique les exclut.

**Avant activation** : confirmer qu'aucune des trois ne double une faille déjà
sourcée (angles distincts : opposabilité du panneau / gêne chantier / mentions
de l'avis) — sinon l'écarter (INACTIVE).

---

## D. FAILLES SUSPENSION — 3 PROPOSITIONS SOURCÉES (à valider)

Le parcours produit existe (type-aware, LRAR préfet, délai 2 mois). Le catalogue
(`src/lib/catalogue-sources.ts`) porte **3 propositions SUSPENSION**
(`verifiee: false` — jurisprudences à confirmer sur Legifrance avant activation),
auxquelles le pack 3F/48SI (§I) en ajoute **6 autres**. Elles arrivent en
`PROPOSEE` par l'auto-alimentation ; le moteur ne les utilise **jamais** tant
qu'elles ne sont pas `ACTIVE` (les 4 ids du pack sont injectés automatiquement,
cf. §I).

| Motif | Article (source) | Jurisprudence | Statut |
|---|---|---|---|
| Suspension **sans procédure contradictoire préalable** | art. **L. 121-1 + L. 211-2 CRPA** ; art. **L. 224-2 CR** | **CE 20 avr. 2021 n° 438114** (texte intégral Legifrance) ; CE 24 mai 2024 n° 474548 ; CE 7 déc. 2017 n° 407700 | `PROPOSEE` — à vérifier |
| Suspension pour alcoolémie **sans marge d'erreur éthylomètre (8 %)** | art. **L. 224-2 + L. 234-1 CR** ; art. 15 **arrêté du 8 juil. 2003** | **CE 14 févr. 2018 n° 407914** ; Cass. crim., 26 mars 2019, n° 18-94.900 | `PROPOSEE` — à vérifier |
| Décision de suspension **non notifiée** | art. **L. 224-16 + R. 224-4 CR** | Cass. crim., 1er avr. 2021, n° 20-82.815 | `PROPOSEE` — à vérifier |

Thèmes restant **à couvrir** (à rédiger par un juriste) : invalidation du permis
(médical), avis de la commission médicale, recours gracieux au préfet sur les
motifs de fond (durée, proportionnalité).

---

## E. DÉLAIS RÈGLEMENTAIRES (moteur, `dateLimitePv`)

- Amende forfaitaire : **45 jours** de contestation.
- Recours suspension de permis : **2 mois**.
- Calcul en **jours francs** (le jour de l'infraction n'est pas compté) avec
  report des échéances tombant un jour férié ou un dimanche au **prochain
  jour ouvré** (`src/lib/delais.ts` : `dateLimitePv`, `reporterJourOuvrable`).
- **Invalidation 48SI — garde forclusion** : `controlerForclusion48si`
  (60 jours, même report) bloque la validation juriste au-delà (encart
  `data-testid="forclusion-48si"`, non bloquant côté client).
- Prescription amende : **1 an** (`datePrescrite`).
- Rappels client : J-10, J-3, J-0 (`src/lib/rappels.ts`).

---

## F. PROCESSUS DE VALIDATION (garde-fou)

1. Une proposition sourcée (§H) arrive en `PROPOSEE` (auto-alimentation) et
   **n'est jamais utilisée par le moteur**.
2. **Activation en masse** (bouton admin « Synchroniser et activer ») :
   synchronisation du catalogue **puis** passage en `ACTIVE` de toutes les
   propositions **complètes** (`estActivable` : règle dégagée + template non
   vide) — l'admin ne les valide plus une par une. Les incomplètes (stationnement
   à sourcer, promotion de veille à rédiger) restent en `PROPOSEE`.
3. Sinon, validation unitaire : l'admin valide (`PROPOSEE` → `ACTIVE`,
   verrou conditionnel idempotent) via **`activerFailleProposee`**, ou écarte
   (`INACTIVE`) via `validerPropositionFaille`.
4. Une faille `INACTIVE` n'est jamais utilisée par le moteur, et aucune
   synchronisation ne la réactive.
5. Seule une faille `ACTIVE` peut produire une lettre.
6. Avant lancement public : **relecture des 8 templates AMENDE ACTIVE et des
   3 propositions SUSPENSION par un avocat** (risque n°4 du PLAN) — les
   jurisprudences `verifiee: false` doivent être confirmées sur Judilibre /
   Legifrance avant activation.

---

## G. BASE JURIDIQUE AUTO-ALIMENTÉE (implémentée)

Le moteur (`detecterFailles`) identifie **toutes** les failles candidates d'un
dossier à partir :
- des **données extraites** (`extractedData`, OCR + saisie humaine) ;
- du **texte brut scanné** du PV (`Dossier.pvTexte`, règle `texteContient` /
  `texteAbsent`) — par ex. détecter une faille « vitesse » quand le texte
  contient « excès de vitesse » ;
- du **contexte étalonnage** (`contexteEtalonnage` : registre admin
  `RadarCalibration` en priorité, sinon date de vérification du cinémomètre
  lue sur le PV — rubrique « Appareil de contrôle homologué », extrait par
  l'OCR ; échéance +1 an, exception +2 ans des postes fixes récents selon la
  date d'installation data.gouv.fr) → certificat expiré le jour de
  l'infraction.

Flux :
1. `analyserDossier` stocke chaque candidat dans `DossierFaille` (statut
   `CANDIDATE`) et retient le premier (ordre de priorité) comme faille
   principale (`failleJuridiqueId` → lettre).
2. Le **juriste confirme** (`CONFIRMEE` = seule principale + lettre régénérée)
   ou **écarte** (`REJETEE`) chaque candidat sur le détail dossier.
3. **Mises à jour de la base (deux canaux)** :
   - **Auto-alimentation (recherche documentaire, §H)** : le catalogue sourcé
     (`src/lib/catalogue-sources.ts::CATALOGUE_SOURCES`) se synchronise
     **automatiquement** (`src/lib/auto-alimentation.ts::synchroniserCatalogue`,
     idempotente, upsert en `PROPOSEE`, ne rétrograde jamais une faille
     ACTIVE/INACTIVE) — déclenchée à l'ouverture de la page **et** par
     `/api/cron/auto-alimentation` (GET/POST, `CRON_SECRET`) : ces deux chemins
     **n'activent jamais**. Le bouton admin **« Synchroniser et activer »**
     (`importerFaillesDepuisSources`) synchronise puis passe en `ACTIVE` toutes
     les propositions complètes (`activerPropositionsCompletes`, garde-fou
     `estActivable` — jamais de lettre vide) en un lot ; reste la validation
     unitaire `validerPropositionFaille` pour les incomplètes et l'écart
     (`INACTIVE`). Chaque proposition du catalogue
     porte déjà un `templateLettre` pré-rédigé (variables
     `{nom}`/`{plaque}`/`{num_pv}`/`{montant}`/`{radarId}`), que le juriste
     ajuste lors de la validation.
   - **Import/export JSON** (`GET /api/admin/failles/export`, inclut
     `jurisprudence` ; `importerFailles`, upsert par id) pour les mises à jour
     en masse — le moteur l'utilise immédiatement, sans déploiement.
4. **Preuves** : client **et** juriste versent des pièces (`Preuve`,
   événement `PREUVE`) sur le détail dossier — RGPD, export portabilité,
   suppression à l'effacement du compte.

**Pour ajouter une faille** : créer la faille dans l'admin (`reglesDetection`
JSON, une règle suffit) — le scan la détectera automatiquement. Le contenu
juridique (article + template) reste du ressort du juriste.

**Démo landing** : `/api/demo/analyse` SIMULE le téléversement d'un échantillon
(avis de contravention ou décision de suspension), scanne contre les failles
**ACTIVE + PROPOSEE** (jamais INACTIVE), affiche `scoreGlobal` (meilleur score
parmi les failles détectées) puis **génère la lettre démo** (`remplirTemplate`
depuis la faille principale, identité fictive « Alex Martin ») — avec la
mention « Simulation de démonstration », aucune donnée stockée.

---

## H. RECHERCHE DOCUMENTAIRE — SOURCES PUBLIQUES (brouillon, à valider par un juriste)

Résultat de la recherche web demandée (« failles répertoriées avec articles de
loi et jurisprudences tirés de sources fiables publiques »). **Garde-fou** :
ce brouillon est **interne** — rien n'est intégré au moteur. Statuts :
`V` = extrait lu sur le site officiel (Legifrance / courdecassation.fr /
conseil-etat.fr) ; `À VÉRIFIER` = référence trouvée via une source secondaire
(blog d'avocat / agrégateur), **à confirmer sur Judilibre ou Legifrance par le
juriste avant toute activation** (pas de jurisprudence non vérifiée).

| Motif / faille | Article (source) | Jurisprudence trouvée | Source consultée | Statut |
|---|---|---|---|---|
| Mentions obligatoires de l'avis de contravention | art. **A. 37-1 CPP**, **A. 37-4 CPP** (LEGIARTI000024079513 / …4499) ; art. **429 CPP** (PV constaté personnellement, LEGIARTI000006576551) | — | legifrance.gouv.fr | `V` (articles) |
| Nullité de l'avis si procédure d'amende forfaitaire **inapplicable** (infraction concomitante non forfaitisable) | art. **529 CPP** | Cass. crim., 30 avr. 2024, n° 23-86.163 ; Cass. crim., 18 nov. 2025, n° 25-80.227 (cassation sans renvoi, avis nul) | query-juriste.com ; kohenavocats.com (renvoie vers courdecassation.fr/decision/691c4c158b6588a4f898c792) | `À VÉRIFIER` (sources secondaires) |
| Amende **majorée** non notifiée / réclamation | art. **530 CPP** (LEGIARTI000048844676), art. **529-2 CPP** (LEGIARTI000048844668) | Cass. crim., 29 oct. 1997, Bull. crim. n° 357 (annulation du titre exécutoire par l'OMP) | legifrance.gouv.fr (articles) ; village-justice.com | `V` (articles) / `À VÉRIFIER` (jurisprudence) |
| Recevabilité requête en exonération (vol, usurpation de plaque, cession, destruction…) | art. **529-10 CPP** (LEGIARTI000043375922) | Cons. const., 29 sept. 2010, n° 2010-38 QPC (conforme à la Constitution) ; Conseil d'État, 9 juil. 2010, n° 339261 (application de l'art. 529-10) | legifrance.gouv.fr ; conseil-etat.fr ; lexbase.fr | `V` (art. 529-10, CE 339261) / `À VÉRIFIER` (QPC) |
| Usurpation de plaque (délit) | art. **L. 317-4-1 CR** | — | mesamendes.fr (article cité) | `À VÉRIFIER` (article à confirmer sur Legifrance) |
| Erreur de plaque d'immatriculation | art. **530-1 CPP** ; art. **L. 121-3 CR** (responsabilité pécuniaire du titulaire) | Cass. crim., 14 nov. 2017, n° 17-81.047 (champ du contrôle des juges) | query-juriste.com | `À VÉRIFIER` (source secondaire) |
| Certificat d'étalonnage du cinémomètre | art. **L. 130-3 CR** ; art. **R. 130-11 CR** (vérification périodique par organisme agréé) | Cass. crim., 12 janv. 2026, n° 25-80.412 (relaxe faute de production du certificat) — **non retrouvée sur Judilibre** | contraventionavocat.fr (blog) ; legifrance | `À VÉRIFIER` (jurisprudence non confirmée) |
| **Suspension sans procédure contradictoire préalable** | art. **L. 121-1 + L. 211-2 CRPA** (CRPA 2015, reprise loi 11 juil. 1979) ; art. **L. 224-1 / L. 224-2 CR** | **CE, 5e ch., 20 avr. 2021, n° 438114** (texte intégral) ; CE, 5e ch., 24 mai 2024, n° 474548 (Inédit) ; CE, 7 déc. 2017, n° 407700 ; CE, 4 nov. 2016, n° 388030 ; CE, 28 sept. 2016, n° 390439 | legifrance.gouv.fr (CETATEXT000043411148) ; reinsdidier-avocat.com | `V` (CE 438114) / `À VÉRIFIER` (autres) |
| **Suspension alcoolémie sans marge d'erreur éthylomètre** | art. **L. 224-2 + L. 234-1 CR** ; art. 15 **arrêté du 8 juil. 2003** (tolérance 8 % ≥ 0,40 mg/l) | **CE, 14 févr. 2018, n° 407914** (marge obligatoire pour le préfet) ; Cass. crim., 26 mars 2019, n° 18-94.900 (marge obligatoire pour le juge) | legifrance.gouv.fr (CETATEXT000036601993) ; ledall-avocat.fr ; capital.fr | `V` (CE 407914) / `À VÉRIFIER` (Cass. crim.) |
| **Décision de suspension non notifiée** | art. **L. 224-16 CR** (notification exigée) ; **R. 224-1 à R. 224-4 CR** (avis de rétention, restitution LRAR) | Cass. crim. (notification exigée par L. 224-16 — ref. exacte à confirmer) | legifrance.gouv.fr (R. 224-1 / R. 224-4) ; ledall-avocat.fr | `V` (articles) / `À VÉRIFIER` (jurisprudence) |

**Notes** :
- Les 4 failles seedées (section A) restent la base de travail. Ce brouillon
  fournit des **fondements supplémentaires potentiels** : amende majorée non
  notifiée, nullité pour procédure inapplicable, vol/usurpation de plaque,
  cession (déjà signal via questionnaire, section B).
- **Pas de nouvelle faille activée avant validation juriste** : l'insertion
  d'une faille se fait par l'admin (bibliothèque juridique unifiée) avec `reglesDetection`
  (ex. `texteContient` « majorée ») et un template rédigé/validé.
- La **Jurisprudence du 12/01/2026 n° 25-80.412** est signalée **non
  confirmée** : l'intégrer dans un produit uniquement si le juriste la
  retrouve sur Judilibre, sinon l'écarter.
---

## I. PACK TÉLÉRECOURS 3F / 48SI (implémenté 2026-10-07)

Offre **Suspension & Invalidation — 199 € (offre unique, pack inclus)**
(`PRIX_SUSPENSION = 199` dans `src/lib/tarifs.ts` —
`estOffreSuspension(kind, amount)` déduit l'offre du montant payé, aucune colonne
`Payment` supplémentaire ; l'ancienne offre Pack à 349 € n'existe plus) : pour
une **suspension préfectorale (3F)** ou une
**invalidation du permis pour solde de points nul (48SI)**, le client reçoit
3 documents de dépôt sur **Télérecours Citoyens** (canal `TELERECOURS` par
défaut du type SUSPENSION).

### Les 6 failles du pack (catalogue, `PROPOSEE` → activation admin)

| id | Fondement | Template |
|---|---|---|
| `faille-3f-delai-retention` | **L. 224-2 et R. 224-3 CR** — suspension d'urgence prononcée hors délai 72 h (120 h si analyses sanguines) alors que le permis est retenu | lettre + **référé** |
| `faille-3f-incompetence` | **L. 211-3 CRPA** — signé par une autorité incompétente | lettre + **référé** |
| `faille-3f-defaut-motivation` | **L. 211-2 / L. 211-5 CRPA** — ni taux d'alcoolémie ni vitesse retenue dans l'arrêté | lettre + **référé** |
| `faille-48si-defaut-info` | **L. 223-3 CR** — décision d'invalidation ne récapitulant pas les précédents retraits ayant concouru au solde nul (défaut d'information) | lettre |
| `faille-48si-plafond-8pts` | **L. 223-2 / R. 223-2 CR** — plus de 8 points retirés | lettre |
| `faille-48si-stage-avant-notification` | **L. 223-6 CR** — stage non suivi avant notification | lettre |

- Arrivée en **`PROPOSEE`** par l'auto-alimentation (§G/H) — le moteur ne les
  utilise qu'après activation. **Injection automatique** : `injecterFaillesPack`
  (fin de `synchroniserCatalogue`, appelée à l'ouverture de la bibliothèque et
  par le cron catalogue) passe **4 des 6** en `ACTIVE` — `faille-3f-delai-retention`,
  `faille-3f-defaut-motivation`, `faille-48si-defaut-info` (L. 223-3),
  `faille-48si-plafond-8pts` (garde-fou `FAILLES_PACK_ACTIVES`) ;
  `faille-3f-incompetence` et `faille-48si-stage-avant-notification` restent en
  `PROPOSEE` (activation manuelle via `activerFailleProposee` ou « Synchroniser
  et activer », garde-fou `estActivable`).
- Sources **`verifiee: false`** (décision D2) : à confirmer sur Légifrance par
  le juriste avant diffusion commerciale.
- **L'« arrêt Sebaoun » demandé est introuvable** (Légifrance/Judilibre) :
  il n'est **PAS versé en base** (anti-hallucination) — ne jamais le réintroduire.
- Seules les failles **`ACTIVE`** entrent en détection ; la détection est
  **filtrée par `typeInfraction`** (`analyserDossier`) : un dossier SUSPENSION
  ne voit jamais les failles AMENDE et inversement.

### Moteur (`src/lib/moteur.ts`)

- Types de règles **additifs** (D3) : `delaiDepasse {limiteHeures, siChamp?}`
  (horodatages par libellé — jamais fabriqués), `datePrealable {champ, reference}`,
  `valeurSuperieure {champ, seuil}`, `et {regles}` ; toute règle peut porter
  `docType: "3F" | "48SI"` (garde en tête d'`evalRegle`).
- `PRIORITE_PACK` : évaluées **après** les 4 failles seedées (zéro régression
  AMENDE) et avant les autres failles SUSPENSION — la première candidate reste
  la principale (→ `templateRefere` → pack complet).
- OCR : `classifierDocType` classe le document (`3F` = arrêté de suspension,
  `48SI` = invalidation solde nul, `AMENDE` = avis de contravention — marqueur
  amende testé en dernier, jamais sur un arrêté ; `undefined` si non reconnu)
  et `normaliserPv` extrait les horodatages
  d'urgence (`dateSignatureArrete`/`heureSignatureArrete`, `dateNotification`,
  `dateStage`, `pointsRetiresMemesDate`) par **libellé explicite**.
- Questionnaire SUSPENSION inchangé (Notification + Recours toujours).

### Pack PDF (`src/lib/pack-telerecours.ts`)

- `genererPackTelecours` rend **requête au fond + Référé-Suspension
  (art. L. 521-2 CJA) + bordereau des pièces** ; le référé vient de
  `remplirTemplate(faille.templateRefere, data)` **brut** (pas de mise en forme
  officielle) et n'est requis qu'**avec** `templateRefere` (sinon pack =
  requête + bordereau, jamais de référé inventé).
- Généré à la validation juriste (**Cas A**, déjà signé) ou à la signature du
  client (**Cas B**) et stocké sur le courrier (`Courrier.packUrls`, migration
  `20261007000000_add_pack_3f_48si` — `FailleJuridique.templateRefere` aussi).
- UI : blocs `data-testid="pack-telerecours"` + `pack-requete` / `pack-refere`
  / `pack-bordereau` sur la fiche **client** et la fiche **juriste** (les deux
  modes, lecture et édition) ; lien de dépôt `fichiers.pack` sur
  `/recours/finaliser` + route token-guardée `?doc=requete|refere|bordereau` ;
  export RGPD et purge du compte suppriment les 3 URLs.
- **Noms de fichiers normalisés** (conventions Télérecours — le nom téléchargé
  est le basename du href, clé `pdfs/pack/<dossierId>/`) :
  `Requete_au_fond_REP.pdf`, `Requete_Refere_Suspension.pdf`,
  `Bordereau_Recapitulatif_des_Pieces.pdf` (pas d'horodatage : régénération =
  écrasement propre du même fichier).

### Suggestions IA post-analyse (`src/lib/auto-enrichissement.ts`)

- Après chaque analyse (`after()` dans `analyserDossier`), passage du cas
  d'espèce IA (`verifierAvecIa`) en **arrière-plan** si `VERIF_IA_PROVIDER=mock`
  ou `GEMINI_API_KEY` : les suggestions (ids du **catalogue seulement**) sont
  écrites dans `DossierFaille.suggestionIa` en statut `CANDIDATE` — jamais de
  template, jamais d'article rédigé par l'IA, jamais de lettre régénérée,
  jamais d'événement dossier. Tracées dans `AutoAlimentationTrace`
  (`campagne = auto-enrichissement`). Réaffichées après chaque relance
  (fusion manuelle `fusionnerCandidats` ne supprime pas les lignes hors
  `idsLettre`).
- Bouton admin **« Valider (Active) »** sur une `PROPOSEE` →
  `activerFailleProposee` (verrou conditionnel idempotent
  `PROPOSEE → ACTIVE`, garde `messageActivationBloquee` = même message que
  `validerPropositionFaille`).

### E2E

`e2e/pack-telerecours.spec.ts` : visite `/dashboard/juriste/failles?f=ACTIVE`
(l'ouverture de la bibliothèque déclenche `synchroniserCatalogue` → injection
pack — plus de clic sur « Synchroniser et activer », qui activerait les 10
failles suspension sans garde docType et casserait `suspension.spec.ts`) →
dépôt SUSPENSION d'un
fichier nommé `arrete-*.png` (provider mock : le **nom de fichier** choisit le
document simulé — voir `extrairePv(buffer, nomFichier)` / `mockOcr`) → badge
« Document classé : suspension préfectorale (3F) » → validation juriste canal
Télérecours → pack 3 PDF côté client **et** juriste (href + octets `%PDF-` sur
disque — `next start` ne sert que les fichiers `public/` présents au boot, les
uploads du run sont donc vérifiés sur disque, jamais via HTTP).

---

## J. DEUX OFFRES ÉTCHES — LOT H (2026-10-07)

Arbitrages validés par le client : **Sebaoun toujours refusé** (jamais versé en
base), **référé maintenu en L. 521-2 CJA** (pas de L. 521-1), **activation
`PROPOSEE → ACTIVE` réservée à l'admin** (`requireAdmin` conservé — le juriste
propose et écarte, jamais d'activation), **périmètre lots H1 + H2 + H3** (H4
refusé : types KBIS/attestation, n° Pièce 1/2/3 du bordereau).

### H1 — Destinataire de la lettre par docType (`src/lib/envoi.ts`)

- `DocTypeAnalyse = "AMENDE" | "3F" | "48SI"` + `lireDocType()` (n'accepte que
  ces 3 valeurs, sinon `undefined`).
- `civiliteSuspension(docType)` : **48SI → « Monsieur le Ministre de
  l'Intérieur »** (l'auteur de la notification d'invalidation), **3F /
  inconnu → « Monsieur le Préfet »** (auteur de l'arrêté). `formuleAppel`,
  `formulePolitesse`, `formuleEnTeteDestinataire`, `enTeteLettre` et
  `formaterLettreOfficielle` prennent `docType?` et le propagent aux trois
  formules (en-tête, appel, politesse) pour rester cohérents.
- `destinataireLrar(type, docType?)` : 48SI → « notification de la décision »
  (jamais « préfet »), 3F → préfet, amende → OMP.
- Idempotence : `politessesConnues()` reconnaît **toutes** les politesses
  connues (neutre / préfet / ministre) — un second habillage (relance,
  changement de docType) ne doublera jamais l'en-tête.
- Call sites : `cases/actions.ts` (`docType: data.docType`) et
  `juriste/actions.ts` (4 sites via `lireDocType` sur `extractedData`,
  `data.docType`, variante, faille confirmée).
- **Tunnel amende 39 € intact** : `formateLettreOfficielle(AMENDE)` ne change
  pas d'un iota (« Madame, Monsieur, » + OMP, test de non-régression).

### H2 — Motifs non couverts → nouvelles `PROPOSEE` (`verif-ia` + `auto-enrichissement`)

- `ReponseIa.motifsNonCouverts` : max **3** motifs `{titre (6-180),
  observation (15-1200), articleCite? (≤120)}`, bornes + dédup côté parser
  (anti-hallucination) ; prompt interdit d'inventer un article non cité
  textuellement ; **mock** renvoie toujours `[]` (jamais de pollution de base
  en dev/E2E).
- `planNouvellesFailles(motifs, titresExistants, pvTexte, typeInfraction)`
  (pur, testé) : dédup titre global (normalisation casse/accents),
  `articleLoi` conservé **uniquement si textuellement présent dans le PV**
  (sinon `""`), `regle` = observation, **`templateLettre = ""`** (l'IA ne
  rédige **jamais** de lettre — `estActivable` l'interdira tant que le juriste
  n'aura pas rédigé le template), id déterministe
  `proposition-ia-<slug>-<hash6>`, plafond `MAX_MOTIFS_NOUVEAUX = 3`.
- IO dans `enrichirApresOcr` (best-effort, jamais bloquant) : `createMany`
  `failleJuridique` (statut **`PROPOSEE`**, `skipDuplicates`) + `createMany`
  `dossierFaille` (`CANDIDATE` + `suggestionIa {source, signalement,
  nouvelleProposition: true, at}`), trace `AutoAlimentationTrace` avec
  `propositions=N`.
- Garde-fous inchangés : `PROPOSEE` = invisible du moteur et des lettres,
  `confirmerFaille` refuse toute faille non `ACTIVE` (vérifié), activation
  admin seule, verrou `FAILLE_IDS` intact.

### H3 — Circuit juriste propose / admin active (`failles-candidates.tsx`)

- La liste des candidatures porte `statutFaille` ; une ligne issue d'une
  proposition IA (`statutFaille === "PROPOSEE"` **ou**
  `suggestionIa.nouvelleProposition`) affiche un **badge ambre « Proposition
  (catalogue) »** + encart explicatif (activation réservée à l'admin, lettre
  impossible tant que `PROPOSEE`), **bouton « Confirmer » masqué** ;
  **« Écarter » conservé** (`rejeterFaille` n'exige pas `ACTIVE`).

### Tests

- `envoi.test.ts` : describe « destinataire par docType (lot H1) » —
  `lireDocType`, 48SI → ministre (en-tête/appel/politesse), LRAR 48SI sans
  « préfet », idempotence 2ᵉ habillage, non-régression amende.
- `verif-ia.test.ts` : describe « motifsNonCouverts » — parse, bornes/plafond
  3, dédup, `articleCite` trop long écarté, mock `[]`.
- `auto-enrichissement.test.ts` : describe « planNouvellesFailles » — sans
  template, article absent → `""`, dédup, plafond `MAX_MOTIFS_NOUVEAUX`, id
  déterministe, observation courte écartée.
- Bilan : **510 tests unitaires** (tsc ✓ / lint ✓), e2e 50/50 inchangés.
