# sos-amende-

**SOS Amende** — SaaS français de contestation d'amendes (LegalTech). Le client paie d'abord, téléverse son PV, l'OCR + le moteur juridique détectent une faille (base juridique sourcée), une lettre motivée est générée, signée électroniquement, validée par un juriste puis transmise à ANTAI / Télérecours — avec suivi jusqu'à la décision de l'OMP.

## Stack

- Next.js 16 (App Router, Server Actions) + React 19 + Tailwind CSS v4
- Prisma 7 (driver-adapter) + PostgreSQL
- Auth.js v5 (magic-link, Resend) — aucun mot de passe
- Stripe (paiement à l'acte, inscription inversée) — portail mock en dev (`STRIPE_MOCK=1`)
- OCR : Tesseract.js (local) / Mistral OCR / Google Vision — relecture humaine obligatoire
- Stockage : local (`public/uploads/`) en dev, S3-compatible UE en prod
- Tests : Vitest (moteur juridique) + Playwright (E2E, port 3200)

## Commandes

```bash
npm install        # lance prisma generate (postinstall)
npm run dev        # serveur de dev (port 3001)
npm run build      # build de production
npm run lint       # eslint
npm test           # tests unitaires Vitest
npm run test:e2e   # E2E Playwright (construit + sert l'app sur le port 3200)
npx prisma db seed # pré-remplit les 4 failles AMENDE ACTIVE
```

## Environnement

Copier `.env.example` → `.env` (dev) et renseigner les valeurs de production via `.env.production.example`. `.env` est gitignoré — jamais committer de secret.

## Garde-fous produit

- Jamais d'article de loi inventé : les lettres n'utilisent que les `FailleJuridique.templateLettre` validées par l'admin.
- Les propositions du catalogue sourcé (`src/lib/catalogue-sources.ts`) arrivent en `PROPOSEE` et ne sont jamais utilisées par le moteur avant validation.
- OCR = brouillon human-in-the-loop (vérification humaine obligatoire).
- L'envoi ANTAI/Télérecours passe par un mock local en dev/E2E — jamais le portail réel.

## Références

- `AGENTS.md` — guide opérationnel du codebase (architecture, commandes, schéma Prisma).
- `FAILLES.md` — inventaire interne des failles juridiques (à garder synchronisé).
- `PLAN.md` — vision produit complète.