# Plan de développement — App de management BLOU FEET
*Rédigé pour Paul Bourdon, management BLOU FEET — juillet 2026*

---

## 0. Résumé exécutif

Objectif : remplacer 3 outils (2 Google Sheets + 1 Notion) et le suivi WhatsApp par une seule app (mobile-first, probablement PWA) centrant : trésorerie, cachets/intermittence, facturation, management fees, décisions, calendrier, contrats, subventions.

**Recommandation techno : Claude Code, pas Lovable**, pour ce projet précis. Détail en section 3. En résumé : les intégrations que tu veux (neobank, Gmail, WhatsApp, parsing IA de contrats) sont toutes des flux backend custom avec règles métier propres à toi (ex : logique de cachets groupés, expiration à 12 mois, "TBC sans Zabeth"...). C'est exactement le terrain où un outil no-code façon Lovable devient vite une cage dorée, alors qu'une base de code que tu contrôles (même écrite avec l'aide de Claude Code) te permet d'itérer sur ces règles sans plafond de verre.

**Notifications pas chères** : Web Push (gratuit, natif PWA) + email transactionnel (Resend, gratuit jusqu'à 3 000/mois) couvrent 90% des besoins. WhatsApp et SMS coûtent réellement de l'argent par message (API Meta Business) — à réserver à une V2, pour les alertes vraiment critiques (ex: cachet qui expire dans 48h).

---

## 1. Ce que j'ai regardé dans tes fichiers réels

J'ai ouvert le sheet "Cachets", le sheet "Suivi financier_BLOU FEET" (management fees, accès partagé le 09/07) et la base Notion "Subventions & Aides".

Points structurants trouvés dans le sheet Cachets, qui **doivent** devenir des règles produit et pas juste des colonnes :

- Chaque ligne a une date d'expiration calculée à **+12 mois** de la date de paiement — c'est littéralement le calcul central du module "cachets intermittence".
- Il y a une notion de **cachets groupés** ("cachet > 5 cachets groupés") — plusieurs tracks payés le même mois sont comptés comme un lot de cachets, pas ligne par ligne. Le modèle de données doit permettre de grouper plusieurs entrées sous un même "lot de cachets".
- Des lignes sont **facturées par un tiers** (ex: agence VEGA) puis reversées en cachet ensuite — donc une entrée peut changer de statut de paiement (facture → cachet) et pas juste passer de "impayé" à "payé".
- Il y a des lignes **sans montant encore connu** ("TBC", répétitions à valoriser plus tard) — le statut "à venir / provisoire" doit exister nativement, pas comme un hack.
- Certaines dates sont à l'étranger, ce qui change le régime SACEM/cachet — un champ "territoire" avec impact sur les règles de calcul est nécessaire.
- Le champ **SACEM** du sheet (valeurs : "répartie", "déclaré", "programme en draft", "date à l'étranger", vide) encode déjà un **cycle de vie par track** — sortie → cachet payé → déclaration SACEM → répartition reçue — mais éparpillé entre ce sheet et le sheet Suivi financier. C'est un point central de la refonte : ce cycle de vie doit devenir une entité transverse du produit plutôt qu'une colonne texte libre. Détail du modèle en section 4 et 5.1(e).
- Il y a une distinction entre lignes "avec Zabeth" et "sans Zabeth" (le label) — pertinent pour le calcul des management fees, car probablement tu ne prends pas de fee sur tout de la même façon.

Points structurants trouvés dans le sheet Suivi financier (management fees) — ce sheet a 3 onglets, "Dashboard", "Encaissements_Dates_Cachets" et "Encaissements" (droits d'auteur SACEM), et le modèle réel est plus précis que ce que j'avais supposé initialement :

- La commission n'est **pas un taux fixe appliqué au brut** : c'est 15% d'une **base nette** = montant encaissé brut **moins des dépenses déductibles propres à la ligne** (ex: répétition, train, frais liés à la date). Chaque ligne de paiement a donc son propre calcul de commission, pas un taux global appliqué au total.
- La commissionabilité des droits d'auteur SACEM **dépend du track, pas du type de revenu** — ce n'est pas "SACEM = toujours exclu à 100%", c'est une décision au cas par cas selon le morceau (probablement liée aux splits d'auteur/composition sur ce track précis — à confirmer avec toi, mais l'app ne doit surtout pas coder une règle globale "SACEM non-commissionnable"). Il faut donc : (i) un flag `is_commissionable` porté par **chaque track**, pas par le type de revenu, et (ii) un mécanisme d'import de la répartition SACEM par track (bordereau) qui vient appliquer automatiquement ce flag à chaque ligne encaissée liée à ce track. Détail du modèle en section 4 et edge cases en 5.1(d).
- Il y a une ligne "**NDF Paul**" (notes de frais, trackées via Tricount) qui vient s'ajouter au montant que l'artiste doit au manager — donc le "reste dû au manager" n'est pas que de la commission : c'est `commission due totale + NDF avancées par le manager − montant déjà versé au manager`.
- Le dashboard affiche un pourcentage de contrôle (7,82% du total encaissé) — un ratio de recoupement utile pour vérifier que la commission effective reste cohérente avec le taux contractuel affiché.
- Il y a une **date de début de calcul** (1/1/2025) explicite — les paiements antérieurs à cette date ne rentrent pas dans le calcul. Ce paramètre doit être configurable, pas codé en dur, au cas où les termes changent avec un futur contrat.
- Certaines lignes ont un statut "**En attente**" avec une commission calculée mais pas encore due tant que le cachet/la facture n'est pas payé — donc, comme pour le module cachets, il faut distinguer commission "projetée" (sur du prévisionnel) et commission "due" (sur de l'encaissé réel).

Points structurants trouvés dans la base Notion Subventions :

- Modèle propre : Aide (titre), Organisme (SACEM/CNM/ADAMI/SPEDIDAM/SPPF/Ministère Culture/Ville de Paris/Région/Autre), Catégorie (Musique enregistrée/Spectacle vivant/Clip vidéo/Développement artiste/Composition/Accompagnement), Statut (À instruire → Dossier en cours → Déposé → Obtenu/Refusé/En attente/Inéligible/Déposé par Zabeth?), Priorité, Montant max, Date limite dépôt, Date dépôt, Résultat attendu, Structure requise (Oui-licenciée / Oui-associée Adami / Non-artiste direct), Lien dossier, Notes.
- Ce modèle est déjà bon — à reprendre quasi tel quel dans l'app, avec vues Kanban par statut (déjà le cas dans Notion) et une vue "deadlines à venir" triée par date limite de dépôt.
- Le champ **Structure requise** est un signal direct pour ta réflexion "faut-il créer une structure juridique" — l'app devrait pouvoir dire "X subventions sont bloquées tant que tu n'as pas de structure".

---

## 2. Principes produit

1. **Une seule source de vérité par type de donnée.** Les sheets/Notion sont mis en lecture seule (ou archivés) une fois la migration validée — sinon vous aurez deux vérités qui divergent en 3 semaines.
2. **L'artiste a un accès restreint**, pas le même que toi : il doit voir "combien on m'a payé, combien je dois au manager, mes dates" — pas forcément le détail des marges ou les échanges de négociation.
3. **Chaque donnée financière garde une traçabilité** (qui a modifié quoi, quand) — indispensable si un jour comptable/expert-comptable ou contrôle SACEM demande un justificatif.
4. **Le produit ne doit pas te forcer une structure juridique** — il doit juste te donner les chiffres pour décider (volume annuel, seuils micro-entreprise, etc.), voir section 8.

---

## 3. Choix techno : Lovable vs Claude Code

| Critère | Lovable | Claude Code |
|---|---|---|
| Vitesse de démarrage d'une UI standard (CRUD, dashboard) | Très rapide | Rapide mais demande plus d'allers-retours |
| Logique métier custom (cachets groupés, expiration à 12 mois, statuts en cascade) | Possible mais tu es dépendant de ce que le générateur "comprend" bien | Tu contrôles 100% du code, aucune limite |
| Intégration neobank (Open Banking / DSP2) | Pas de connecteur prêt à l'emploi fiable en marketplace aujourd'hui — il faudra quand même du code custom via un agrégateur (Powens, Budget Insight/Bridge, Tink) | Idem, mais plus simple à câbler proprement dans du code que tu maîtrises |
| Intégration Gmail (créer des tâches depuis des mails, fermer une tâche à la réponse) | Faisable via automatisations mais fragile pour une logique aussi conditionnelle | Tu as déjà des connecteurs Gmail/Google Drive/Notion actifs dans cette conversation — la logique peut être prototypée et testée directement | 
| WhatsApp Business API | Peu ou pas outillé nativement | Intégration API standard, gérable |
| Parsing de contrats par IA (extraire avances, splits, deadlines) | Nécessite quand même d'appeler une API IA depuis un backend custom | Naturel — c'est exactement le genre de pipeline (upload PDF → extraction structurée → alertes) que Claude Code écrit bien |
| Coût récurrent | Abonnement Lovable + hébergement + intégrations tierces | Coût de dev (ton temps ou un freelance) + hébergement (souvent moins cher, ex. Vercel/Supabase gratuits en dessous d'un certain volume) |
| Qui maintient après la V1 | Dépendant du studio/plateforme et de sa pérennité | Toi ou n'importe quel développeur, code standard (pas de lock-in) |
| Risque produit si tu n'es pas développeur toi-même | Plus accessible pour bricoler seul au début | Nécessite un minimum de suivi technique (toi avec Claude Code, ou un dev freelance) |

**Recommandation : Claude Code**, avec la stack suivante (choix pragmatique pensé pour rester gratuit/pas cher au démarrage) :

- **Frontend** : Next.js (PWA — installable sur mobile, pas besoin de passer par les stores iOS/Android, zéro friction de distribution avec ton artiste)
- **Backend/DB/Auth** : Supabase (Postgres + auth + storage de fichiers de contrats — gratuit jusqu'à un volume confortable pour vous deux)
- **Notifications** : Web Push (gratuit) + Resend pour email (gratuit jusqu'à 3 000 emails/mois)
- **Hébergement** : Vercel (gratuit en usage perso/petit projet)
- **IA (parsing contrats, résumé de mails)** : API Claude directement (tu payes à l'usage, très faible volume au début)

Coût mensuel réaliste en V1 : **0 à ~20€/mois** (hors éventuel coût d'agrégation bancaire si tu branches une vraie neobank, qui elle a un coût réel — voir section 5.1).

Si tu préfères vraiment ne pas coder du tout et veux un prototype cliquable en 1 jour pour valider les écrans avec ton artiste avant d'investir, Lovable peut servir de **maquette jetable** (V0), mais je ne le construirais pas comme socle final vu la complexité métier ci-dessus.

---

## 4. Modèle de données (vue d'ensemble)

```
Artist (1) — a — plusieurs Payments (cachets/factures/tracks)
Payment appartient à un PaymentBatch optionnel (regroupement "cachets groupés")
Payment a un Status: provisoire | facturé | cachet_en_attente | payé
Payment a un Territory: France | étranger
Payment a un Source: label | booking | clip | track | résidence | figuration

Track — catalogue des morceaux (titre, éventuels alias/versions: instrumental, sped up, VHS...)
  - is_commissionable (bool, décidé au cas par cas par toi — probablement lié aux splits d'auteur du track), avec historique par période
  - notes (raison de la décision, ex: split avec tel co-auteur)
  - **Cycle de vie (statut transverse, calculé à partir des autres entités, pas saisi à la main) :**
    1. `date_sortie` (saisie manuelle, date de sortie officielle du morceau)
    2. `cachet_payé` (dérivé : existence d'un `Payment` de type Track lié à ce track, avec statut payé)
    3. `sacem_declaration_status`: non_déclaré | programme_en_draft | déclaré | date_à_l'étranger (saisi manuellement, reprend les valeurs déjà utilisées dans le sheet Cachets)
    4. `sacem_repartition_reçue` (dérivé : existence d'au moins une `SacemStatementLine` rapprochée à ce track)
  - Chaque étape a une date associée, pour pouvoir calculer des délais (ex: temps moyen entre déclaration et répartition reçue) et détecter les retards anormaux.

SacemStatement — import d'un bordereau de répartition SACEM
  - période, date d'import, fichier source
  - contient plusieurs SacemStatementLine (track_ref texte brut tel qu'écrit par la SACEM, montant, à rapprocher d'un Track du catalogue)

ManagementFee — générée automatiquement 1-à-1 avec chaque Payment
  - deductible_expenses (montant déductible propre à la ligne, ex: répétition/train)
  - net_base = payment.amount − deductible_expenses
  - commission_rate (global, ex: 15%, override possible par ligne si besoin)
  - is_commissionable (hérité du Track lié au Payment quand il s'agit de droits d'auteur ; sinon true par défaut pour les cachets/factures de spectacle vivant)
  - commission_due = net_base × commission_rate (0 si is_commissionable=false)
  - status: projetée (sur du prévisionnel) | due (cachet/facture payé, commission exigible) | versée
  - already_paid_to_manager (montant déjà versé sur cette ligne)

ManagerLedger (vue agrégée, pas une table en soi) :
  reste_dû_au_manager = Σ(commission_due, status=due) + Σ(NDF non remboursées) − Σ(déjà_versé_au_manager)

Expense (NDF) — montant, description, lien Tricount optionnel, statut: à rembourser | remboursée, lié ou non à un Payment précis

Invoice — cycle de vie: brouillon | envoyée | en_attente_paiement | payée | en_retard
  (peut être liée à un ou plusieurs Payment)

Decision/Task — titre, description, owner, priorité, statut, source (manuel|gmail|whatsapp), lié à un mail_thread_id optionnel

Event (calendrier) — date, lieu, type (concert, résidence, répétition), lié à un ou plusieurs Payment, sync Google Calendar

Contract — fichier PDF, résumé IA, deadlines extraites (avance, split, échéance), alertes liées

Grant (subvention) — reprend le schéma Notion existant (Organisme, Catégorie, Statut, Priorité, Montant max, dates, Structure requise, Notes)
```

---

## 5. Modules détaillés + edge cases

### 5.1 MONEY

**a) Solde bancaire (neobank)**
- Intégration via un agrégateur bancaire agréé DSP2 (Powens, Bridge/Bankin, Budget Insight) — pas d'accès direct "générique" à une neobank, il faut passer par ce type de service. Coût réel à prévoir (souvent quelques dizaines d'euros/mois pour un compte connecté en usage API) — **ce n'est pas gratuit**, contrairement aux notifications.
- Edge case : compte pro vs perso non séparés → risque de tout afficher/mélanger. Il faut un filtrage explicite par compte dès le départ.
- Edge case : synchronisation qui échoue silencieusement (token expiré côté banque) → prévoir une alerte "reconnexion nécessaire", sinon tu crois avoir un solde à jour qui est en fait périmé depuis 3 semaines.
- Alternative moins chère en V1 : saisie manuelle du solde 1x/semaine (30 secondes), tu gardes la vraie synchro bancaire pour la V2 une fois le reste du produit validé.

**b) Factures (cycle de vie)**
- États : brouillon → envoyée → en attente de paiement → payée / en retard / annulée.
- Edge case : une facture "convertie en cachet" après coup (vu dans tes données réelles, ex. VEGA facture puis cachet versé) → il faut pouvoir **muter** une facture en cachet sans perdre l'historique, pas juste supprimer/recréer.
- Edge case : relance automatique — à combien de jours de retard ? Probablement un rappel à J+15 et J+30, paramétrable.
- Edge case : facture partiellement payée (acompte) — le modèle doit supporter plusieurs paiements partiels sur une même facture.

**c) Suivi cachets intermittence**
- Calcul central : nombre de cachets valides à l'instant T = cachets dont la date d'expiration (paiement + 12 mois) n'est pas dépassée.
- Edge case : cachets groupés — un "lot" de 5 cachets doit compter comme 5 dans le total même s'il n'y a qu'une ligne de paiement.
- Edge case : cachets à l'étranger — ne comptent pas forcément de la même façon pour l'intermittence française ; il faut un flag "compte pour l'intermittence oui/non" plutôt que de déduire ça du champ territoire automatiquement (le droit du travail du spectacle a ses subtilités, mieux vaut un champ explicite validé à la main que du calcul auto qui se trompe silencieusement).
- Edge case : projection de cachets à venir (dates bookées mais pas encore payées) — doit apparaître dans une vue "projection" séparée du "acquis", pour ne jamais confondre ce qui est sûr et ce qui est prévisionnel.
- Alerte utile : "3 cachets expirent dans les 60 prochains jours" → notification proactive.

**d) Management fees** — modèle confirmé à partir de ton sheet réel "Suivi financier_BLOU FEET" :
- Chaque `Payment` génère automatiquement une ligne de commission : `commission_due = (montant_brut − dépenses_déductibles) × 15%`. La granularité "par track" que tu voulais existe déjà nativement dans tes données (chaque bordereau SACEM, chaque cachet, chaque track a sa propre ligne) — pas besoin d'une checkbox manuelle, l'app doit juste garder cette granularité ligne par ligne et permettre de cocher/valider chaque ligne comme "commission traitée".
- **La commissionabilité des droits d'auteur se gère par track, pas par une règle globale "SACEM = exclu".** Chaque track du catalogue a un flag `is_commissionable` que tu décides toi-même (probablement selon les splits d'auteur/composition propres à ce morceau). Quand une ligne de répartition SACEM tombe sur un track marqué non-commissionnable, sa commission est automatiquement à 0€ ; sur un track marqué commissionnable, la commission de 15% s'applique normalement. **Ne jamais coder en dur "tout revenu SACEM = non-commissionnable"** — ta correction confirme que ça dépend du morceau.
- **Import de bordereau SACEM** : les bordereaux SACEM arrivent avec un intitulé de ligne par track (souvent avec variantes : "Martini", "Martini - Instrumental", "Martini - Sped Up", "Martini - Vhs") — il faut un écran d'import (upload CSV/PDF du bordereau, ou saisie manuelle au début) qui :
  1. Parse chaque ligne du bordereau (référence track, montant réparti, date/période).
  2. Propose un **rapprochement automatique** avec les tracks déjà connus au catalogue (matching approximatif sur le titre, avec confirmation manuelle avant validation — ne jamais assigner automatiquement une commissionabilité sans relecture).
  3. Si un titre du bordereau ne correspond à aucun track existant (nouvelle chanson, ou variante jamais vue), demande de créer le track et de définir son statut `is_commissionable` avant de valider l'import.
  4. Une fois rapproché, applique le flag `is_commissionable` du track à la ligne de paiement générée, calcule la commission en conséquence.
- Edge case : un même track peut changer de statut dans le temps (ex: un split renégocié) — garder un historique du flag `is_commissionable` par période plutôt qu'un simple booléen figé, pour ne pas recalculer à tort les commissions déjà validées dans le passé.
- Edge case : import en double (le même bordereau importé deux fois) — il faut une clé d'unicité (période + track + référence bordereau) pour éviter de dupliquer les montants encaissés.
- Edge case : dépenses déductibles **ad hoc par ligne** (répétition, train, frais liés à une date précise) — il faut un champ libre par paiement, pas une liste fermée de catégories, car tes notes actuelles montrent des cas très spécifiques ("Déduit: répétition + train iNOUÏS").
- Edge case : **NDF (notes de frais) du manager**, actuellement trackées à part sur Tricount — l'app doit avoir un module `Expense` séparé qui vient s'ajouter au solde "reste dû au manager", sans se confondre avec la commission elle-même (ce sont deux natures de dette différentes : commission sur des revenus de l'artiste vs remboursement d'avances du manager).
- Edge case : commission "**projetée**" vs "**due**" — une ligne en statut "En attente" (facture pas encore payée) a une commission calculée mais qui ne doit pas apparaître dans le "reste dû" tant que le paiement sous-jacent n'est pas confirmé. Sinon tu comptes de l'argent que tu n'as pas encore.
- Edge case : **date de début de calcul** paramétrable (actuellement 1/1/2025) — à ne jamais coder en dur, pour pouvoir la faire évoluer si les termes de la commission changent à l'avenir.
- Vue "Dashboard" à répliquer telle quelle dans l'app : total encaissé brut, total dépenses déductibles, assiette nette, commission due totale, déjà versé, reste dû (montant + % de contrôle du total encaissé) — c'est exactement l'écran que ton artiste et toi regardez aujourd'hui, donc à ne pas perdre dans la refonte.
- Ce modèle ne dépend pas de ce que prévoit le contrat Zabeth sur la répartition label/artiste — il porte uniquement sur ta commission de management sur l'argent qui arrive à l'artiste. Pas besoin de validation juridique supplémentaire ici, le calcul est déjà éprouvé dans ton sheet actuel.

**e) Cycle de vie des tracks (transverse à tout le module Money)**
- Ta remarque est juste : sortie, cachet, déclaration SACEM et répartition ne doivent pas être 4 informations éparpillées dans 3 fichiers différents comme aujourd'hui — ça doit être **un seul écran par track** qui montre l'avancement de ces 4 étapes, avec les entités liées (le `Payment` du cachet, la `SacemStatementLine` de répartition une fois importée).
- Vue "Tracks" recommandée : une ligne par track du catalogue, avec une timeline visuelle des 4 étapes et leurs dates, plutôt qu'un statut unique — parce que dans tes données réelles l'ordre n'est pas toujours le même (ex: un track peut être déclaré avant que son cachet soit payé, ou l'inverse).
- Edge case : **track sorti sans cachet payé après un certain délai** → alerte (retard de paiement du label à relancer).
- Edge case : **cachet payé mais jamais déclaré à la SACEM** → alerte différente (oubli administratif, à corriger vite car ça bloque la répartition et donc la commission).
- Edge case : **déclaré mais répartition jamais reçue** → attention à ne pas alerter trop tôt : le délai réel de répartition SACEM se compte en mois (souvent 12–18 mois). L'alerte ne doit se déclencher qu'au-delà d'un délai paramétrable (pas un seuil arbitraire codé en dur), sinon tu reçois des fausses alertes en permanence.
- Edge case : un track "date à l'étranger" peut ne jamais passer par une répartition SACEM française classique — le cycle de vie doit accepter qu'une étape soit **non applicable** pour certains tracks, pas juste "en retard".
- Edge case : les variantes d'un même track (instrumental, sped up, VHS...) vues dans le bordereau SACEM sont rattachées au même `Track` parent pour le cachet et la sortie, mais peuvent chacune avoir leur propre ligne de répartition SACEM et donc leur propre commission — le modèle doit permettre plusieurs `SacemStatementLine` par `Track`, pas une seule.
- Ce cycle de vie est ce qui **connecte concrètement** les modules Cachets et Management Fees demandés en tête de ta liste de priorités : un même écran "Track" doit pouvoir répondre à "où en est ce morceau" sans avoir à croiser 3 fichiers à la main comme aujourd'hui.

### 5.2 Suivi des décisions (remplace WhatsApp)

- Modèle simple : tâche = titre + description + owner + priorité + statut (à valider/en cours/fait) + lien optionnel vers un mail ou une date d'événement.
- **Gmail → tâches automatiques** : faisable, mais attention à l'edge case principal : *qu'est-ce qui déclenche la création d'une tâche ?* Un mail entrant ne devient pas automatiquement une tâche (sinon spam/newsletters polluent tout) — il faut soit (i) un déclencheur manuel ("transformer ce mail en tâche" via un bouton/extension), soit (ii) un filtre strict (mails d'expéditeurs connus : label, salle, booker) passés par un classifieur IA qui ne crée une tâche que si le mail contient une question ou une demande d'action.
- Edge case sur la fermeture automatique : "si on répond à quelqu'un, fermer la tâche" est risqué — répondre ne veut pas dire que la question est résolue (ex: relance, réponse partielle). Mieux vaut : répondre marque la tâche "en attente de retour" plutôt que "fermée", et un statut "fermée" reste une action explicite.
- **WhatsApp** : techniquement possible via l'API WhatsApp Business (Meta), mais (i) ce n'est pas gratuit au-delà d'un certain volume de conversations, (ii) ça demande une validation Meta Business assez lourde pour un usage aussi précis. Recommandation : **ne pas commencer par WhatsApp**. Commencer par push notification + email, migrer vers WhatsApp seulement si l'artiste refuse vraiment d'utiliser l'app pour ces échanges.

### 5.3 Calendrier des dates bookées

- Sync bidirectionnelle avec Google Calendar : chaque `Event` créé dans l'app crée/maj un événement Google Calendar (et vice versa si tu veux pouvoir aussi créer depuis Calendar).
- Edge case : une date annulée après coup — ne pas juste supprimer l'event, marquer "annulée" pour garder trace (utile côté cachets si un cachet avait déjà été facturé sur cette date).
- Edge case : lien Event ↔ Payment un-à-plusieurs (une date de festival peut générer plusieurs lignes de paiement : répétition + showcase, comme dans tes données réelles) — le modèle doit permettre plusieurs `Payment` par `Event`.
- Edge case de synchro : conflit si quelqu'un modifie l'heure directement dans Google Calendar — définir qui est la source de vérité (recommandation : l'app est maître, Calendar en lecture pour l'artiste).

### 5.4 Contrats + extraction IA

- Upload PDF → extraction structurée (avances, splits, deadlines de paiement, durée, exclusivité, territoire) via l'API Claude, avec un écran de relecture humaine obligatoire avant que les deadlines extraites créent des alertes (ne jamais faire confiance à 100% à une extraction automatique sur un document juridique).
- Edge case : contrat qui amende un contrat précédent (avenant) — modèle doit lier les versions entre elles, pas juste stocker des PDF isolés.
- Edge case : deadlines conditionnelles ("paiement à 30 jours après remise des masters" plutôt qu'une date fixe) — l'IA doit pouvoir extraire une règle et pas seulement une date, et te demander de saisir la date déclenchante manuellement.
- Sécurité : ces documents sont sensibles (montants, clauses d'exclusivité) — accès restreint à toi seul par défaut, pas visible par l'artiste sauf partage explicite.

### 5.5 Subventions (remplace Notion)

- Reprendre le schéma Notion existant tel quel (il est déjà bon, voir section 1) : Aide, Organisme, Catégorie, Statut, Priorité, Montant max, Date dépôt, Date limite dépôt, Résultat attendu, Structure requise, Lien dossier, Notes.
- Ajouter une seule chose qui manque : un lien vers le module "structuration juridique" — si `Structure requise` = "Oui — licenciée" et que tu n'as pas encore de structure, l'app doit le signaler comme un frein actif plutôt qu'une simple donnée statique.
- Edge case : deadlines de dépôt qui glissent (reportées par l'organisme) — garder un historique des dates plutôt qu'écraser la date limite.

---

## 6. Notifications — stratégie qui reste pas chère

| Canal | Coût | Cas d'usage recommandé |
|---|---|---|
| Web Push (PWA) | Gratuit | Rappels quotidiens/hebdo, alertes cachets qui expirent, nouvelle tâche assignée |
| Email (Resend, Postmark free tier) | Gratuit jusqu'à ~3k/mois | Résumé hebdo, factures en retard, deadlines subventions |
| SMS | ~0,05€/SMS | Réservé aux alertes vraiment critiques (ex: date de dépôt subvention demain) |
| WhatsApp Business API | Payant par conversation, validation Meta lourde | À éviter en V1, uniquement si l'artiste ne regarde jamais l'app |

Astuce concrète : sur PWA, la notification push demande que l'utilisateur "installe" l'app sur son écran d'accueil (Add to Home Screen) — à faire onboarder explicitement à l'artiste dès le premier jour, sinon les notifications ne partiront jamais.

---

## 7. Accès partagé avec l'artiste & sécurité

- Deux rôles minimum : `manager` (accès total) et `artist` (accès restreint : ses paiements reçus, ce qu'il doit en fees, son calendrier, ses tâches assignées — pas les contrats bruts, pas les marges détaillées).
- RGPD : données financières + coordonnées bancaires potentielles → hébergement UE (Supabase a des régions EU), et ne jamais stocker d'identifiants bancaires en clair (l'agrégateur bancaire gère ça, tu ne dois recevoir que des soldes/transactions, jamais les identifiants de connexion banque).

---

## 8. Structuration juridique — ce que l'app peut objectivement t'aider à voir

Je ne te donne pas de conseil juridique définitif ici (je ne suis ni avocat ni expert-comptable, et ça dépend de seuils réglementaires qui évoluent) mais l'app peut te sortir automatiquement, à partir des données déjà modélisées :
- Le volume annuel de cachets/factures facturées en direct (utile pour juger si tu dépasses les seuils de la micro-entreprise).
- Le nombre de dates où une salle a refusé le cachet et demandé une facture — un indicateur concret de la fréquence du problème que tu décris.
- Les subventions bloquées faute de structure (`Structure requise` = licenciée).

Ces trois chiffres, mis à jour automatiquement, sont ce qu'il faut amener à un expert-comptable spécialisé spectacle vivant pour trancher entre micro-entreprise / association / SAS — la décision elle-même ne doit pas être automatisée par l'app.

---

## 9. Roadmap étape par étape

**Phase 0 — Cadrage (2-3 jours)**
- Choisir l'agrégateur bancaire (si tu veux la vraie synchro dès la V1) et vérifier son coût réel.
- Vérifier avec Zabeth si un jour une autre catégorie de revenu (autre que SACEM) doit aussi être exclue de la commission, pour ne pas coder une règle trop étroite.

**Phase 1 — MVP (3–4 semaines, avec Claude Code)**
- Auth (toi + artiste), modèle de données de base.
- Module Cachets/Paiements (sans neobank, saisie manuelle) + calcul d'expiration à 12 mois + cachets groupés.
- Module Management Fees avec le modèle réel (base nette, SACEM non-commissionable, NDF/Tricount, dashboard reste dû).
- Module Factures (cycle de vie complet).
- Module Décisions/Tâches (manuel, pas encore Gmail).
- Calendrier avec sync Google Calendar (lecture + écriture).
- Migration des données du sheet Cachets, du sheet Suivi financier et de la base Notion Subventions.
- Notifications push + email de base.

**Phase 2 — Automatisations (2–3 semaines)**
- Intégration Gmail (création de tâches semi-automatique avec validation).
- Upload + extraction IA des contrats (avec relecture obligatoire).
- Management fees avec granularité par track.

**Phase 3 — Argent en temps réel (selon budget)**
- Intégration neobank via agrégateur.
- Éventuellement WhatsApp si le besoin est confirmé après la Phase 1/2.

**Phase 4 — Polish**
- Vue "structuration juridique" (indicateurs section 8).
- Rapports exportables (comptable, expert-comptable).

---

## 10. Prochaines étapes immédiates

1. Modèle de données validé sur les 3 sources réelles (Cachets, Suivi financier/Management fees, Subventions Notion) — prêt à donner tel quel à Claude Code comme spec de départ.
2. Dans Claude Code : commencer par le schéma Postgres (section 4) + migration des 3 sources, puis le module Cachets/Fees ensemble puisqu'ils sont liés 1-à-1 dans tes données.
3. Point ouvert avant de coder l'import SACEM : lister avec toi les tracks déjà connus comme non-commissionnables (et pourquoi), pour pré-remplir le catalogue `Track` avant le premier import de bordereau.
