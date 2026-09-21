---
description: Intègre une nouvelle demande dans le cahier des charges avant tout développement
argument-hint: "<la demande, telle qu'exprimée>"
---
Nouvelle demande du Business Owner : « $ARGUMENTS »

Applique le skill `requirements-engineering` :

1. Enregistre le **besoin brut** (nouvel identifiant BES-nn) sans le reformuler.
2. Pose au besoin la ou les questions « pourquoi ? » nécessaires pour faire émerger le besoin réel (3 maximum), et attends les réponses.
3. Rédige les exigences système : sujet + « doit » / « peut » + complément mesurable, une exigence par phrase, sans termes vagues
   ni solution technique imposée, avec priorité MoSCoW, source, méthode de vérification et critère d'acceptation.
4. Vérifie la cohérence avec les exigences existantes (contradiction, redondance) et signale les impacts.
5. Propose la mise à jour de `docs/CAHIER_DES_CHARGES.md` (nouvelle version dans le tableau d'en-tête) et les nouvelles
   tâches dans `docs/ROADMAP.md`. **N'écris aucun code** : attends la validation.
