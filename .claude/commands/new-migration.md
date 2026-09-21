---
description: Fait évoluer le schéma Drizzle et génère une nouvelle migration PostgreSQL versionnée
argument-hint: "<description courte en snake_case>"
allowed-tools: Bash(npx drizzle-kit generate:*), Bash(npm run test:integration)
---
Objet de la migration : **$ARGUMENTS**

1. Lire `.claude/rules/database.md`, `backend/src/db/schema.ts` et les migrations existantes de `backend/drizzle/`.
2. Si le changement est destructif (`DROP`, suppression de colonne, changement de type réduisant les données) :
   s'arrêter et demander l'accord du Business Owner avant toute modification.
3. Modifier `backend/src/db/schema.ts` en respectant les conventions (noms de contraintes, `timestamp(3)` avec fuseau,
   commentaire citant l'exigence servie par chaque index). **Ne jamais modifier une migration existante.**
4. Générer la migration : `npx drizzle-kit generate --name $ARGUMENTS` (dans `backend/`). `drizzle-kit push` est interdit.
5. Relire le SQL généré et ajouter en tête un commentaire : tâche (T-xxx), exigence justifiant le changement,
   caractère destructif ou non.
6. Appliquer sur la base de test locale (`npm run test:integration`). Jamais sur Neon depuis Claude Code :
   la base hébergée est migrée par le service `migrate`.
7. Donner l'`EXPLAIN` (base locale) des requêtes que les nouveaux index doivent servir.
