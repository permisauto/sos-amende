# Table de calibration des scores

Document de travail pour le juriste. **Aucun de ces poids n'est appliqué au
moteur tant qu'ils ne sont pas validés** (voir `FAILLES_CALIBREES` dans
`src/lib/moteur.ts`).

## Ce que mesure le score

Le score mesure la **corroboration documentaire** d'un motif de contestation,
c'est-à-dire le nombre d'éléments concordants dans le dossier. Ce n'est **pas**
une probabilité de succès de la contestation : l'OMP statue au fond et dispose
d'un large pouvoir d'appréciation. Un dossier peut être rejeté malgré un score
élevé, et un dossier recevable peut aboutir.

Terminologie dans l'UI : « indice de corroboration des motifs ».

## Règle de plafonnement appliquée dans le moteur

| Statut de la faille | Règles qui matchent | Plafond |
|---|---|---|
| Non calibrée (16 failles du catalogue) | 1 | 45 |
| Non calibrée | 2 ou plus | 45 |
| Calibrée, base manuelle | selon switch | 98 |
| Calibrée multi-règles | 1 seule règle matchée | 60 |
| Calibrée multi-règles | 2 ou plus | 98 |

Les 4 failles déjà calibrées conservent leur base existante : prescription 88,
mentions 72/92, erreur de plaque, étalonnage 82.

## Point méthodologique important

Une règle qui matche prouve que le dossier **présente** le motif, pas que le
motif **est établi**. C'est pourquoi une faille non calibrée plafonne à 45 même
si sa règle est satisfaite : la calibration est précisément ce qui autorise à
dire « cet indice vaut 88 ».

Une faille entre dans `FAILLES_CALIBREES` quand le juriste a vérifié :

1. l'article et la version en vigueur à la date de l'infraction ;
2. la jurisprudence citée sur source primaire ;
3. que le score reflète le degré de corroboration réel, pas une intuition.

## Tableau à valider

Colonnes : *faille, article, règles de détection, proposition de calibration*.

Le score proposé ci-dessous est la **base** avant pondération. Il reste à
confirmer ou corriger.

### Groupe A — motifs de forme et de procédure (forts, indépendants de la preuve externe)

| Faille | Article | Règle actuelle | Base proposée |
|---|---|---|---|
| `faille-prescription-peine-3ans` | art. 133-4 CP ; art. 530 al. 1 CPP | `texteContient: "titre exécutoire"` | 90 |
| `faille-avis-majoration-non-notifiee` | art. 530, 529-2 CPP | `texteContient: "majorée"` | 90 |
| `faille-avis-inapplicable-procedure` | art. 529 CPP | `texteContient: "sans avertissement préalable"` | 88 |
| `faille-absence-signature-agent` | art. 429, 66 CPP | `texteAbsent: "signature"` | 85 |
| `faille-avis-mentions-obligatoires` | art. A. 37-1, A. 37-4 CPP | `texteAbsent: "voie de recours"` | 85 |

### Groupe B — motifs de/nullité materially vérifiable

| Faille | Article | Règle actuelle | Base proposée |
|---|---|---|---|
| `faille-erreur-plaque-jurisprudence` | art. 530-1 CPP | `plaqueIncorrecte` | 95 |
| `faille-lieu-imprecis` | art. 429, 537, 43 CPP | `texteAbsent: "commune"` | 80 |
| `faille-homologation-radar` | art. R. 110-10 CR | `texteAbsent: "homologué"` | 80 |
| `faille-panneau-non-conforme` | art. R. 411-25 CR | `texteClient` à créer | 78 |

### Groupe C — motifs techniques de mesure (exigent une preuve externe)

| Faille | Article | Règle actuelle | Base proposée |
|---|---|---|---|
| `faille-etalonnage-jurisprudence` | art. L. 130-3, R. 130-11 CR | `etalonnageExpire` | 82 |
| `faille-marge-tolerance-vitesse` | Arrêté 4 juin 2009 art. 14-15 | `texteContient: "marge"` | 75 |
| `faille-interception-sans-constat` | art. 429 CPP | `texteContient: "intercepté"` | 72 |
| `faille-delai-notification` | art. 529-2, 530 CPP, R. 322-7 CR | `texteContient: "délai"` | 70 |

### Groupe D — exonération par requérant (dépend d'une pièce du client)

| Faille | Article | Règle actuelle | Base proposée |
|---|---|---|---|
| `faille-exoneration-vol-usurpation` | art. 529-10 CPP ; art. L. 317-4-1 CR | `texteContient: "vol"` | 70 |
| `faille-usurpation-plaque` | art. L. 317-4-1 CR | `texteContient: "usurpation"` | 70 |
| `faille-photo-illisible` | art. L. 121-3, 537 CPP | `texteContient: "photo"` | 55 |

## Doutes à trancher avant validation

1. **`faille-etalonnage-jurisprudence`** — la jurisprudence est
   explicitement marquée « non vérifiée, introuvable sur Judilibre », et la
   date (2026) est incohérente avec les autres références. Ne pas calibrer tant
   que la source primaire n'est pas confirmée.
2. **`faille-prescription-peine-3ans`** — jurisprudence dont l'URL Legifrance
   (`JURITEXT000051234567`) paraît avoir été posée manuellement. À vérifier.
3. **`faille-usurpation-plaque`** — aucune jurisprudence, source « à confirmer ».
   Candidat à l'exclusion ou à la fusion avec `faille-exoneration-vol-usurpation`.
4. **`faille-avis-mentions-obligatoires`** — doublon possible de
   `faille-mentions-obligatoires` (calibrée, base 72/92). Les deux coexistent
   aujourd'hui en base. Arbitrage : fusion ou conservation séparée ?
5. **`faille-panneau-non-conforme`** — la règle de détection
   (`texteAbsent: "arrêté"`) est trop lâche et le juriste est cité comme
   juridiction sur une jurisprudence qui n'en est pas une. Proposer une règle
   plus précise avant calibration.
6. **`faille-delai-notification`** — le titre mélange plusieurs régimes de
   délai (45 j, 30 j, 3 mois, changement d'adresse). Un score unique est
   probablement trompeur ; à scinder.

## Effet attendu

Avant : 20 failles actives, dont 16 plafonnées à 98 dès qu'une règle matchait.

Après calibration validée : le dossier réel ne peut atteindre un indice élevé
que sur des motifs dont le juriste a confirmé la solidité. Les motifs de
catalogue non validés restent visibles comme pistes de travail, plafonnés à 45,
et le libellé affiché au client continue d'indiquer que l'indice ne prédit
pas la décision de l'administration.