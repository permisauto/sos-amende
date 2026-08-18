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
- `src/lib/moteur.ts` → `FAILLE_IDS`, `detecterFailles` (règles + ordre de priorité), `scoreFaille`
- `src/lib/catalogue-sources.ts` → `CATALOGUE_SOURCES` (propositions sourcées §H)
- Base live : table `FailleJuridique` (admin `Base juridique`, auto-alimentation PROPOSEE, import/export JSON)

---

## A. FAILLES AMENDE — IMPLÉMENTÉES (4, seedées, `ACTIVE`)

| # | Id (FAILLE_IDS) | Titre | Article | Source | Déclencheur (règles `reglesDetection`) |
|---|---|---|---|---|---|
| 1 | `faille-prescription-1-an` | Prescription de l'action publique (1 an) | art. 9 du Code de procédure pénale | Code de procédure pénale | `{type: "datePrescrite"}` |
| 2 | `faille-mentions-obligatoires` | Défaut de mentions obligatoires sur l'avis de contravention | art. R. 246-1 et s. du Code de la route | Code de la route | `{type: "champAbsent", champ: "numTelePaiement"}` **ou** `{type: "champAbsent", champ: "cle"}` |
| 3 | `faille-erreur-plaque` | Erreur de plaque d'immatriculation | art. 530-1 du Code de procédure pénale | Code de procédure pénale | `{type: "plaqueIncorrecte"}` |
| 4 | `faille-certificat-etalonnage` | Demande de communication du certificat d'étalonnage du cinémomètre | art. L. 130-3 du Code de la route + arrêté du 27 mars 2007 | Code de la route / Arrêté du 27 mars 2007 | `{type: "etalonnageExpire"}` (radar connu, certificat expiré le jour de l'infraction) |

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
inventé). Le juriste décide du fondement ou rejette.

| Signal (`extractedData`) | Libellé client | Comportement |
|---|---|---|
| `paiementDejaFait` | Amende déjà payée | Transmis au juriste |
| `vehiculeCede` | Véhicule cédé avant l'infraction | Transmis au juriste |
| `vehiculeVole` | Véhicule volé / plaque usurpée | Transmis au juriste |
| `conducteurDifferent` | Un autre conducteur était au volant | Transmis au juriste |

---

## C. FAILLES AMENDE — PRÉVUES, NON RÉDIGÉES

Issues du PLAN §5 (« 5 fondements de base : paiement, cession, vol/usurpation,
erreur matérielle, amnistie »). Les quatre premiers sont couverts par A ou B
(signaux). Manque :

| Motif | Statut | Article | Template |
|---|---|---|---|
| Amnistie | **À saisir par un juriste** | À déterminer par le juriste | Vide — à rédiger |

---

## D. FAILLES SUSPENSION — 3 PROPOSITIONS SOURCÉES (à valider)

Le parcours produit existe (type-aware, LRAR préfet, délai 2 mois). Le catalogue
(`src/lib/catalogue-sources.ts`) porte désormais **3 propositions SUSPENSION**
(`verifiee: false` — jurisprudences à confirmer sur Legifrance avant activation).
Elles arrivent en `PROPOSEE` par l'auto-alimentation ; le moteur ne les utilise
**jamais** tant que l'admin ne les a pas validées (`ACTIVE`).

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
- Prescription amende : **1 an** (`datePrescrite`).
- Rappels client : J-10, J-3, J-0 (`src/lib/rappels.ts`).

---

## F. PROCESSUS DE VALIDATION (garde-fou)

1. Une proposition sourcée (§H) arrive en `PROPOSEE` (auto-alimentation) et
   **n'est jamais utilisée par le moteur**.
2. L'admin valide (`ACTIVE`) ou écarte (`INACTIVE`) via `validerPropositionFaille`.
3. Une faille `INACTIVE` n'est jamais utilisée par le moteur.
4. Seule une faille `ACTIVE` peut produire une lettre.
5. Avant lancement public : **relecture des 8 templates AMENDE ACTIVE et des
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
- du **contexte étalonnage** (radar connu → certificat expiré le jour de
  l'infraction).

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
     ACTIVE/INACTIVE) — déclenchée à l'ouverture de la page admin **et** par
     `/api/cron/auto-alimentation` (GET/POST, `CRON_SECRET`). L'admin ne fait
     que **valider** (`validerPropositionFaille` → `ACTIVE`, la faille devient
     détectable) ou **écarter** (`INACTIVE`). Chaque proposition du catalogue
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
  d'une faille se fait par l'admin (`Base juridique`) avec `reglesDetection`
  (ex. `texteContient` « majorée ») et un template rédigé/validé.
- La **Jurisprudence du 12/01/2026 n° 25-80.412** est signalée **non
  confirmée** : l'intégrer dans un produit uniquement si le juriste la
  retrouve sur Judilibre, sinon l'écarter.