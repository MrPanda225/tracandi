---
description: Réalise la prochaine tâche de docs/ROADMAP.md en TDD, avec traçabilité vers le cahier des charges
argument-hint: "[T-xxx optionnel pour forcer une tâche]"
allowed-tools: Bash(git status), Bash(git diff:*), Bash(npm run check), Bash(npm run test:*)
---
## Contexte
- État Git : !`git status --short`
- Tâche demandée : $ARGUMENTS (si vide : première tâche `[ ]` de docs/ROADMAP.md dont les tâches précédentes sont `[x]`)

## Procédure — suivre chaque étape dans l'ordre, sans en sauter

1. **Cadrer**
   - Lire la tâche dans `docs/ROADMAP.md` et chacune des exigences citées dans `docs/CAHIER_DES_CHARGES.md`
     (énoncé, critère d'acceptation, règles de gestion RG-xx liées).
   - Si une exigence est ambiguë, incomplète ou contradictoire : **s'arrêter**, poser la question au Business Owner
     et proposer de l'ajouter en §12 « Questions ouvertes ». Ne jamais inventer une règle.
   - Passer la tâche à `[~]` dans la roadmap.
   - Annoncer en 5 lignes maximum le plan : fichiers créés/modifiés, tests prévus, dépendance éventuelle à installer.

2. **Tests d'abord**
   - Écrire les tests qui traduisent chaque critère d'acceptation, titres préfixés par l'identifiant (`[EF-CAN-07] ...`).
   - Les exécuter et constater qu'ils échouent pour la bonne raison.

3. **Implémenter**
   - Code minimal pour faire passer les tests, en respectant `.claude/rules/` (clean-code, security, database-mysql, etc.).
   - Toute modification de schéma : nouvelle migration via `/project:new-migration`.
   - Toute nouvelle dépendance : demander l'accord avec justification (règle security.md).

4. **Vérifier**
   - `npm run check` dans chaque package modifié (typecheck + lint + tests unitaires) : doit être vert.
   - Si la tâche touche la base : `npm run test:integration` dans `backend/` (MySQL : `docker compose up -d db`).
   - Relire le diff (`git diff`) avec la checklist de `/project:review`.

5. **Tracer**
   - Mettre à jour `docs/TRACABILITE.md` : une ligne par exigence couverte (tâche, fichier de test, statut `couverte`).
   - Passer la tâche à `[x]` dans `docs/ROADMAP.md`.

6. **Livrer**
   - Commit unique : `T-xxx <type>(<module>): <résumé en anglais>` + corps listant les exigences couvertes.
   - Rapport final au Business Owner : ce qui est fait, comment le vérifier (commande ou écran), points d'attention.
   - **S'arrêter.** Ne pas enchaîner la tâche suivante sans accord. En fin de lot, proposer une démonstration.
