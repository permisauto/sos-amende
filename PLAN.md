# Plan — SOS Amende : SaaS de contestation automatisée (amendes + permis)

## 1. Vision & positionnement

**Problème :** les automobilistes ont 45 jours (amendes) et 2 mois (recours admin) pour agir, mais ne connaissent ni les motifs juridiques valables ni la procédure (qui contacter, quels délais, quels documents).

**Produit :** un SaaS qui capture l'avis de contravention (photo/upload), analyse le dossier contre une base de motifs légaux français, génère le courrier de recours prêt à envoyer (LRAR), et suit les délais + statuts jusqu'à résolution.

**Modèle économique :** abonnement + pack à l'acte (amende 29–49 €, dossier permis 79–149 €), tier « avocat partenaire » en option.

## 2. Cadre juridique FR (contrainte n°1 du produit)

| Cas | Procédure | Délais | Qui agit |
|---|---|---|---|
| Amende forfaitaire 1er-3e classe (105e) | Requête en exonération auprès de l'**OMP** (ANTAI ou LRAR) | 45 j (sinon majoration x2/x4) | Le citoyen (pas de monopole avocat) |
| Amende + consignation (4e-5e classe, délit) | Recours **obligatoirement par avocat** | 45 j | Avocat obligatoire |
| Rejet de l'OMP | Poursuite devant **tribunal de police** | fonction des actes | Le citoyen |
| Rétention administrative (alcool, stup, grand excès) | Recours **gracieux préfet** puis **référé-suspension** devant TA (art. L521-1 CJA) | 2 mois gracieux ; référé très court (48–72 h avant exécution) | Citoyen (représentation avocat non obligatoire, recommandée) |
| Invalidation du permis (12 pts) | Stage + **commission médicale** | fixé par le préfet | Le citoyen |

**Conséquences produit :**
- L'automatisation complète est **légale uniquement** pour les cas où le citoyen peut agir seul (amendes 1re-3e classe + recours gracieux permis).
- Pour le reste : le SaaS oriente vers un **avocat partenaire** (modèle commission) — sinon le produit fait de la consultation juridique interdite (loi du 31/12/1971, art. 54).
- Disclaimer + mentions légales RGPD obligatoires (données = infraction = sensibles).

## 3. Parcours utilisateur (2 flux MVP)

**Flux A — Amendes**
1. Upload photo de l'avis de contravention → OCR (numéro, plaque, montant, infraction, date, adresse OMP)
2. Questionnaire ciblé (paiement déjà fait ? cession véhicule ? vol ? conducteur différent ?)
3. Moteur de motifs juridiques → sélection du meilleur fondement
4. Génération **requête en exonération** (PDF) + enveloppe LRAR auto-préparée
5. Suivi : échéance 45 j, statut OMP (accepté/rejeté), étape tribunal de police

**Flux B — Permis**
1. Upload du courrier de rétention/invalidation
2. Détermination du type (alcool/stup/vitesse), détection de la voie de recours (gracieux, hiérarchique, référé-suspension)
3. Génération recours gracieux au préfet (PDF) + chronologie d'urgence
4. Si risque d'exécution rapide : alerte « référé-suspension » + orientation avocat partenaire
5. Suivi commission médicale / restitution

## 4. Architecture technique (Next.js fullstack)

```
Frontend        → Next.js 15 (App Router, RSC) + Tailwind + shadcn/ui
Backend         → API routes / Server Actions (mêmes repo)
Base de données → Postgres (Supabase ou Neon) + Prisma
Auth            → Auth.js (email + magic link)
Paiement        → Stripe (abonnements + paiement à l'acte)
Stockage        → S3-compatible (photos avis, PDF) — presigned URLs
OCR             → Cloud OCR (Google Vision / Azure) en worker + relecture humaine
PDF             → react-pdf / pdf-lib (requêtes en exonération, recours)
Email/SMS       → Resend (notifications délais, statuts)
Jobs/Cron       → Inngest (deadline manager, rappels J-10/J-3/J-0)
Observabilité   → Sentry
Hébergement     → Vercel + Postgres managé
```

Choix clés :
- **Pare-feu RGPD :** les pièces (avis, permis) sont sensibles → chiffrement at-rest, rétention paramétrable, accès restreint, hébergement UE.
- **Brouillon human-in-the-loop :** l'OCR n'envoie jamais seul un courrier ; un écran de vérification est obligatoire.
- **Deadline manager centralisé** (Inngest) : moteur d'échéances réglementaires paramétrables par type d'affaire.

## 5. Modèle de données (Prisma)

- `User` — compte, abonnement
- `Driver` — infos conducteur (nom, NEPH, adresse)
- `Vehicle` — immatriculation, certificat de cession
- `Ticket` (amende) — numéro ANTAI, infraction, montant, statut, date limite 45 j, motif retenu
- `PermitCase` (permis) — type (alcool/stup/vitesse/points), préfet, décision, échéances
- `Case` — type (`amende`|`permis`), statut machine (draft→sent→disputed→resolved), timeline
- `Document` — PDF générés, preuves uploadées
- `Deadline` — type, date, actions, auto-rappels
- `LegalRule` — base de motifs juridiques (versionnée, éditable par admin)
- `Subscription`, `Payment`, `Invoice`
- `LawyerMatch` — mise en relation avocat partenaire

## 6. Roadmap / phases

**Phase 0 — Fondations (sem. 1-2)**
Repo Next.js + Prisma + Postgres, Auth, dashboard vide, Stripe abonnement, layout RGPD (CGV, mentions, consentement).

**Phase 1 — Flux Amende (sem. 3-5)** *(MVP prioritaire, 80% du volume)*
Upload + OCR + vérification, moteur de motifs (5 fondements de base : paiement, cession, vol/usurpation, erreur matérielle, amnistie), génération requête en exonération PDF, envoi LRAR simulé, suivi + rappels 45 j.

**Phase 2 — Flux Permis (sem. 6-8)**
Intake rétention, recours gracieux préfet, détection urgence → référé, parcours commission médicale, suivi.

**Phase 3 — Paie à l'acte + avocats partenaires (sem. 9-10)**
Stripe paiement à l'acte, module mise en relation avocat, transfert dossier.

**Phase 4 — Durcissement (sem. 11-12)**
Tests de non-régression juridique (les motifs = le produit, il faut des fixtures), Sentry, sauvegardes, audit RGPD, beta.

## 7. Risques & garde-fous

1. **Monopole des avocats** → MVP restreint aux cas sans représentation obligatoire ; orientation avocat sinon. *Décision juridique n°1 à trancher.*
2. **Fiabilité OCR sur photos de téléphone** → relecture humaine + re-capture guidée.
3. **Modèle payant uniquement** (0 crédibilité d'un SaaS « gratuit » dans ce domaine) — échelon gratuit limité à l'analyse.
4. **Exactitude des motifs** → base juridique éditable par admin, revue par un avocat avant lancement.
5. **RGPD/sensibilité** → minimisation, rétention, hébergement UE.
