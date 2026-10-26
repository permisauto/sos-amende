# Templates à valider — SOS Amende

**Document de travail pour relecture juridique par avocat**

---

## Rappel du processus

Chaque lettre générée pour un client = `remplirTemplate(template, {nom, plaque, num_pv, montant, radarId, date, lieu, metier, entreprise, risque_licenciement})`

Une fois validés, ces templates sont **la seule source** du contenu juridique des lettres envoyées à l'OMP / Tribunal administratif.

---

## Variables disponibles

| Variable | Description | Exemple |
|----------|-------------|---------|
| `{nom}` | Nom du client | "Jean Dupont" |
| `{plaque}` | Immatriculation véhicule | "AB-123-CD" |
| `{num_pv}` | Numéro avis/décision | "202600012345" |
| `{montant}` | Montant amende | "135 €" |
| `{radarId}` | Identifiant cinémomètre | "RDR-789" |
| `{date}` | Date infraction (toutes lettres) | "15 janvier 2026" |
| `{lieu}` | Lieu infraction | "RD 920, PK 12" |
| `{metier}` | Métier client (urgence) | "chauffeur-livreur" |
| `{entreprise}` | Employeur (urgence) | "SARL Transports Martin" |
| `{risque_licenciement}` | Conséquence (urgence) | "risque de licenciement pour impossibilité de conduire" |

> **Variables d'urgence** (`metier`, `entreprise`, `risque_licenciement`) : **effacées proprement** si non saisies par le client (via `nettoyerLettre`).

---

## 1. FAILLES AMENDE — 4 templates (ACTIVE, seed)

### 1.1 `faille-prescription-1-an`
**Article** : Article 9 du Code de procédure pénale  
**Variables** : `{nom}`, `{plaque}`, `{num_pv}`

```
Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

En application de l'article 9 du Code de procédure pénale, l'action publique pour une contravention se prescrit par une année révolue à compter du jour où l'infraction a été commise. Plus d'un an s'étant écoulé entre la date de l'infraction et la notification du présent avis, l'action publique est éteinte.

Cette contestation est dès lors fondée. En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende réclamée.
```

---

### 1.2 `faille-mentions-obligatoires`
**Article** : Articles R. 246-1 et suivants du Code de la route  
**Variables** : `{nom}`, `{plaque}`, `{num_pv}`

```
Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

Cet avis ne comporte pas l'ensemble des mentions obligatoires prescrites par les articles R. 246-1 et suivants du Code de la route, notamment la signature de l'agent verbalisateur, l'heure de constatation et le matricule de celui-ci. Cette omission entache la procédure d'une irrégularité substantielle.

En conséquence, je vous demande de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende réclamée.
```

---

### 1.3 `faille-erreur-plaque`
**Article** : Article 530-1 du Code de procédure pénale  
**Variables** : `{nom}`, `{plaque}`, `{num_pv}`

```
Je soussigné(e) {nom}, conteste l'avis de contravention n° {num_pv} qui m'a été notifié.

La plaque {plaque} mentionnée sur cet avis de contravention ne correspond pas au véhicule dont je suis titulaire ; je ne suis dès lors pas l'auteur de l'infraction qui m'est reprochée.

En application de l'article 530-1 du Code de procédure pénale, je demande à être exonéré de l'amende encourue. Je vous demande en conséquence de bien vouloir annuler la contravention n° {num_pv} et m'exonérer du paiement de l'amende réclamée.
```

---

### 1.4 `faille-certificat-etalonnage`
**Article** : Article L. 130-3 du Code de la route et arrêté du 27 mars 2007  
**Variables** : `{nom}`, `{plaque}`, `{num_pv}`, `{radarId}`

```
Je soussigné(e) {nom}, titulaire du certificat d'immatriculation du véhicule immatriculé {plaque}, conteste l'avis de contravention n° {num_pv} établi d'après une mesure de vitesse réalisée par un cinémomètre.

En application de l'article L. 130-3 du Code de la route et de l'arrêté du 27 mars 2007 relatif aux conditions de l'étalonnage des cinémomètres, la mesure de vitesse doit être effectuée au moyen d'un appareil dûment étalonné. Je demande en conséquence la communication du certificat d'étalonnage du cinémomètre utilisé, valable à la date de l'infraction, dans un délai de trente jours.

À défaut de production de ce certificat dans le délai imparti, la mesure doit être regardée comme irrégulière et la contravention annulée. Je vous prie dès lors de bien vouloir m'exonérer du paiement de l'amende réclamée.
```

---

## 2. FAILLES SUSPENSION HORS PACK — 3 templates (PROPOSEE, à activer)

### 2.1 `faille-suspension-sans-contradictoire`
**Article** : L. 121-1 et L. 211-2 CRPA ; L. 224-2 CR  
**Variables** : `{nom}`, `{num_pv}`, `{date}`

```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été prise sans que j'aie été mis en mesure de présenter des observations préalables, alors qu'aucune urgence caractérisée ne justifiait de s'en dispenser.

En application des articles L. 121-1 et L. 211-2 du Code des relations entre le public et l'administration, une décision individuelle défavorable prise en considération de la personne doit être précédée d'une procédure contradictoire permettant à l'intéressé de présenter ses observations ; à défaut, elle est entachée d'illégalité (Conseil d'État, 20 avril 2021, n° 438114 ; 24 mai 2024, n° 474548 ; 7 décembre 2017, n° 407700).

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.
```

---

### 2.2 `faille-suspension-marge-erreur-ethylometre`
**Article** : L. 224-2 et L. 234-1 CR ; Art. 15 arrêté 8 juil. 2003  
**Variables** : `{nom}`, `{num_pv}`, `{date}`

```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a suspendu mon permis de conduire pour conduite sous l'empire d'un état alcoolique.

Cette suspension se fonde sur une mesure d'alcoolémie obtenue au moyen d'un éthylomètre, sans prise en compte de la marge d'erreur maximale tolérée de l'appareil.

En application des articles L. 224-2 et L. 234-1 du Code de la route et de l'article 15 de l'arrêté du 8 juillet 2003, une suspension pour alcoolémie ne peut être prononcée que si le seuil légal a été effectivement dépassé, la marge d'erreur maximale tolérée de 8 % devant être prise en compte, sauf lorsque le résultat communiqué l'intègre déjà (Conseil d'État, 14 février 2018, n° 407914 ; Cass. crim., 26 mars 2019, n° 18-84.900).

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.
```

---

### 2.3 `faille-suspension-notification-irreguliere`
**Article** : L. 224-16 et R. 224-4 CR  
**Variables** : `{nom}`, `{num_pv}`, `{date}`

```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a suspendu mon permis de conduire.

Cette décision ne m'a pas été régulièrement notifiée : elle ne m'a été ni remise directement, ni adressée par lettre recommandée avec demande d'avis de réception, comme l'exigent les articles L. 224-16 et R. 224-4 du Code de la route. Une décision de suspension non notifiée dans ces conditions n'est pas opposable à son destinataire.

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.
```

---

## 3. PACK 3F / 48SI — 6 failles × 2 templates = 12 templates

**Tous utilisent le même `templateRefere` (modèle commun pack)**

### Modèle commun : `REFERE_SUSPENSION_PACK` (art. L. 521-2 CJA)

**Variables** : `{nom}`, `{num_pv}`, `{date}`, `{metier}`, `{entreprise}`, `{risque_licenciement}`

```
À Monsieur le Président du tribunal administratif siégeant en formation de référé,

Je soussigné(e) {nom}, ai l'honneur de saisir Monsieur le Président, par la présente requête en référé, d'une demande de suspension d'exécution de la décision n° {num_pv} en date du {date} portant atteinte à la validité de mon permis de conduire.

SUR LE FONDEMENT DE L'ARTICLE L. 521-2 DU CODE DE JUSTICE ADMINISTRATIVE

L'urgence est caractérisée par les conséquences immédiates de la décision contestée sur ma vie personnelle et professionnelle. J'exerce l'activité de {metier} au sein de {entreprise}, et la privation immédiate de la possibilité de conduire met en péril la poursuite de mon activité : {risque_licenciement}.

Le moyen présenté à l'appui de la présente demande est la légalité manifeste de la décision contestée, tel qu'exposé dans la requête au fond déposée simultanément au greffe de la juridiction — illégalité dont il est sérieusement douté qu'elle puisse être écartée au principal.

EN CONSÉQUENCE

Je demande qu'il plaise à Monsieur le Président du tribunal administratif, en application de l'article L. 521-2 du code de justice administrative, d'ordonner la suspension de l'exécution de la décision n° {num_pv} en date du {date}, l'administration disposant du délai légal pour régulariser la situation si elle le juge opportun.
```

> ⚠️ **À vérifier** : Destinataire correct selon type dossier (3F → Préfet, 48SI → Ministre Intérieur) — géré par `civiliteSuspension(docType)` dans `envoi.ts`, mais le template ci-dessus vise le TA (référé).

---

### 3.1 `faille-3f-delai-retention` (ACTIVE injectée)
**Article** : L. 224-2 (I A, I et III) CR  
**Variables lettre** : `{nom}`, `{num_pv}`, `{date}`  
**Référé** : `REFERE_SUSPENSION_PACK` (ci-dessus)

**Lettre (requête au fond)** :
```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été prononcée au-delà du délai impératif de soixante-douze heures — ou de cent vingt heures lorsque les vérifications prévues par l'article L. 224-2 ont été effectuées — à compter de la rétention de mon permis, alors que celui-ci m'avait été retiré.

En application de l'article L. 224-2 du Code de la route, la suspension d'urgence devait être prononcée dans ces délais ; à défaut, aux termes de son III, mon permis de conduire devait m'être remis à disposition, sans préjudice de l'application ultérieure des articles L. 224-7 à L. 224-9.

En conséquence, je vous demande de bien vouloir retirer la décision de suspension prise à mon encontre.
```

**Référé** : `REFERE_SUSPENSION_PACK` (identique ci-dessus)

---

### 3.2 `faille-3f-defaut-motivation` (ACTIVE injectée)
**Article** : L. 211-2 et L. 211-5 CRPA  
**Variables lettre** : `{nom}`, `{num_pv}`, `{date}`  
**Référé** : `REFERE_SUSPENSION_PACK`

**Lettre** :
```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

L'arrêté de suspension ne mentionne ni le taux d'alcoolémie qui m'est reproché, ni la vitesse retenue à l'encontre de mon véhicule, alors que ces mesures objectives constituent le seul fondement factuel de la décision.

En application des articles L. 211-2 et L. 211-5 du Code des relations entre le public et l'administration, une décision individuelle défavorable doit comporter l'énoncé des considérations de droit et de fait qui en constituent le fondement, de façon à permettre à l'intéressé d'en comprendre le sens et la portée et d'en contester la légalité. Un arrêté qui ne reproduit aucune mesure objective ne satisfait pas à cette exigence.

En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre.
```

**Référé** : `REFERE_SUSPENSION_PACK`

---

### 3.3 `faille-3f-incompetence` (PROPOSEE)
**Article** : L. 224-2 CR (compétence préfet) ; principes délégation signature  
**Variables lettre** : `{nom}`, `{num_pv}`, `{date}`  
**Référé** : `REFERE_SUSPENSION_PACK`

**Lettre** :
```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle le préfet a prononcé la suspension de mon permis de conduire.

Cette décision a été signée par le secrétaire général, sans que soit mentionnée aucune délégation de signature l'y autorisant, alors que la compétence de prononcer la suspension appartient au préfet.

En application de l'article L. 224-2 du Code de la route et des principes généraux régissant la délégation de signature, un acte administratif ne peut être signé au nom d'un autorité par un autre que lui sans délégation expresse couvrant l'acte ; à défaut, l'acte est entaché d'incompétence.

En conséquence, je vous demande de bien vouloir annuler la décision de suspension prise à mon encontre pour incompétence du signataire.
```

**Référé** : `REFERE_SUSPENSION_PACK`

---

### 3.4 `faille-48si-defaut-info` (ACTIVE injectée)
**Article** : L. 223-3 CR  
**Variables lettre** : `{nom}`, `{num_pv}`, `{date}`  
**Référé** : `REFERE_SUSPENSION_PACK`

**Lettre** :
```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle il m'a été notifié l'invalidation de mon permis de conduire pour solde de points nul.

La décision ne récapitule pas les précédents retraits de points ayant concouru au solde nul que l'administration entend me opposer. Elle ne me permet donc pas de contrôler le calcul aboutissant à ce prétendu solde nul, ni d'en vérifier l'exactitude.

En application des articles L. 223-3 et L. 223-1 du Code de la route, la décision notifiant le retrait aboutissant à un nombre nul doit informer le titulaire du permis de manière complète : récapituler les précédents retraits ayant concouru au solde nul, prononcer l'invalidation du permis de conduire et enjoindre de le restituer au préfet dans un délai de dix jours francs. Cette formalité substantielle, qui conditionne la régularité de la décision, n'a pas été respectée.

En conséquence, je vous demande de bien vouloir retirer la décision d'invalidation prise à mon encontre.
```

**Référé** : `REFERE_SUSPENSION_PACK`

---

### 3.5 `faille-48si-plafond-8pts` (ACTIVE injectée)
**Article** : L. 223-2 et R. 223-2 CR  
**Variables lettre** : `{nom}`, `{num_pv}`, `{date}`  
**Référé** : `REFERE_SUSPENSION_PACK`

**Lettre** :
```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle il m'a été notifié l'invalidation de mon permis de conduire pour solde de points nul.

Les retraits de points pris en compte pour constater ce solde nul dépassent le plafond légal de huit points applicable aux infractions commises simultanément. La somme des retraits excédant ce plafond, le calcul du solde nul sur lequel repose la décision est erroné et la privation de mon permis de conduire infondée.

En application des articles L. 223-2 et R. 223-2 du Code de la route, dans le cas où plusieurs infractions entraînant retrait de points sont commises simultanément, les retraits se cumulent dans la limite de huit points. Tout retrait excédant ce plafond est illégal et ne peut concourir à l'invalidation de mon permis.

En conséquence, je vous demande de bien vouloir revoir le calcul des points retirés, reconstituer le solde réel de mon permis de conduire et retirer la décision d'invalidation prise à mon encontre.
```

**Référé** : `REFERE_SUSPENSION_PACK`

---

### 3.6 `faille-48si-stage-avant-notification` (PROPOSEE)
**Article** : L. 223-1 et L. 223-6 CR  
**Variables lettre** : `{nom}`, `{num_pv}`, `{date}`  
**Référé** : `REFERE_SUSPENSION_PACK`

**Lettre** :
```
Je soussigné(e) {nom}, conteste la décision n° {num_pv} en date du {date} par laquelle il m'a été notifié l'invalidation de mon permis de conduire pour solde de points nul.

Le stage de sensibilisation à la sécurité routière que j'ai suivi avait été accompli antérieurement à la notification de la décision contestée. L'attestation correspondante ouvrait droit à la récupération de quatre points, qui devaient être recrédités sur mon permis avant que ne soit constaté un quelconque solde nul.

En application des articles L. 223-6 et L. 223-1 du Code de la route, l'attestation délivrée à l'issue du stage donne droit à la récupération de quatre points, le préfet procédant à la reconstitution des points dans le délai d'un mois à compter de la réception de l'attestation ; le solde de points devant être apprécié après cette reconstitution, l'invalidation notifiée ne peut être maintenue.

En conséquence, je vous demande de bien vouloir recréditer les points ouverts par mon stage, reconstituer mon solde de points et retirer la décision d'invalidation prise à mon encontre.
```

**Référé** : `REFERE_SUSPENSION_PACK`

---

## Résumé : 19 templates à valider

| Catégorie | Nb failles | Templates/faille | Total |
|-----------|------------|------------------|-------|
| AMENDE (seed) | 4 | 1 (lettre) | 4 |
| SUSPENSION hors pack | 3 | 1 (lettre) | 3 |
| Pack 3F/48SI | 6 | 2 (lettre + référé) | 12 |
| **TOTAL** | **13 failles** | | **19 templates** |

---

## Feuille de validation (à retourner complétée)

| # | Faille ID | Type template | Article cité | Validation | Commentaires |
|---|-----------|---------------|--------------|------------|--------------|
| 1 | faille-prescription-1-an | Lettre | Art. 9 CPP | ☐ Validé / ☐ À modifier | |
| 2 | faille-mentions-obligatoires | Lettre | Art. R.246-1+ CR | ☐ Validé / ☐ À modifier | |
| 3 | faille-erreur-plaque | Lettre | Art. 530-1 CPP | ☐ Validé / ☐ À modifier | |
| 4 | faille-certificat-etalonnage | Lettre | Art. L.130-3 CR + arr. 27/03/2007 | ☐ Validé / ☐ À modifier | |
| 5 | faille-suspension-sans-contradictoire | Lettre | L.121-1/211-2 CRPA, L.224-2 CR | ☐ Validé / ☐ À modifier | |
| 6 | faille-suspension-marge-erreur-ethylometre | Lettre | L.224-2/L.234-1 CR, arr. 08/07/2003 | ☐ Validé / ☐ À modifier | |
| 7 | faille-suspension-notification-irreguliere | Lettre | L.224-16/R.224-4 CR | ☐ Validé / ☐ À modifier | |
| 8 | faille-3f-delai-retention | Lettre | L.224-2 (I A, I, III) CR | ☐ Validé / ☐ À modifier | |
| 9 | faille-3f-delai-retention | Référé | L.521-2 CJA | ☐ Validé / ☐ À modifier | |
| 10 | faille-3f-defaut-motivation | Lettre | L.211-2/211-5 CRPA | ☐ Validé / ☐ À modifier | |
| 11 | faille-3f-defaut-motivation | Référé | L.521-2 CJA | ☐ Validé / ☐ À modifier | |
| 12 | faille-3f-incompetence | Lettre | L.224-2 CR + délégation | ☐ Validé / ☐ À modifier | |
| 13 | faille-3f-incompetence | Référé | L.521-2 CJA | ☐ Validé / ☐ À modifier | |
| 14 | faille-48si-defaut-info | Lettre | L.223-3 CR | ☐ Validé / ☐ À modifier | |
| 15 | faille-48si-defaut-info | Référé | L.521-2 CJA | ☐ Validé / ☐ À modifier | |
| 16 | faille-48si-plafond-8pts | Lettre | L.223-2/R.223-2 CR | ☐ Validé / ☐ À modifier | |
| 17 | faille-48si-plafond-8pts | Référé | L.521-2 CJA | ☐ Validé / ☐ À modifier | |
| 18 | faille-48si-stage-avant-notification | Lettre | L.223-1/223-6 CR | ☐ Validé / ☐ À modifier | |
| 19 | faille-48si-stage-avant-notification | Référé | L.521-2 CJA | ☐ Validé / ☐ À modifier | |

---

**Validé le** : _______________  
**Par Me** : _______________  
**Signature** : _______________