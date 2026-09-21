---
description: Revue du diff courant contre les règles du projet (clean-code, security, database-mysql, testing)
allowed-tools: Bash(git diff:*), Bash(git status)
---
## Diff à revoir
!`git diff --stat HEAD`

Relis le diff complet (`git diff HEAD`) et rends un verdict par section. Format : **violation → règle → correction**.
Pas de remplissage ; « RAS » si une section est conforme.

1. **Exigences** : chaque changement se rattache-t-il à une exigence de la tâche ? Du code hors périmètre ?
2. **Clean code** (`.claude/rules/clean-code.md`) : nommage, taille et responsabilité des fonctions, `any`, mutations,
   nombres magiques, erreurs avalées, couplage entre modules.
3. **Sécurité** (`.claude/rules/security.md`) : validation zod aux frontières, mass assignment, secrets, journaux,
   chemins de fichiers, contenu externe envoyé à l'IA, CORS/CSRF.
4. **MySQL** (`.claude/rules/database-mysql.md`) : requêtes paramétrées, `SELECT *`, index nécessaires (demander
   l'`EXPLAIN` des nouvelles requêtes), transactions, migration modifiée.
5. **Tests** (`.claude/rules/testing.md`) : chaque critère d'acceptation testé, branches « sinon », aucun appel réseau réel,
   identifiants d'exigence dans les titres.
6. **Traçabilité** : `docs/TRACABILITE.md` et `docs/ROADMAP.md` à jour.

Termine par : **Prêt à commiter** ou **À corriger** (liste numérotée).
