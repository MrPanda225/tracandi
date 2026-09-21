---
description: Crée une nouvelle migration MySQL versionnée conforme aux règles DBA
argument-hint: "<description courte en snake_case>"
allowed-tools: Bash(npm run db:migrate), Bash(npm run test:integration)
---
Objet de la migration : **$ARGUMENTS**

1. Lire `.claude/rules/database-mysql.md` et les migrations existantes de `database/migrations/`.
2. Créer `database/migrations/NNN_$ARGUMENTS.sql` avec NNN = dernier numéro + 1 (sur 3 chiffres).
   **Ne jamais modifier une migration existante.**
3. En tête du fichier : commentaire avec la tâche (T-xxx), l'exigence justifiant le changement et le caractère
   destructif ou non. Si destructif (`DROP`, suppression de colonne, changement de type réduisant les données) :
   s'arrêter et demander l'accord du Business Owner avant d'écrire le fichier.
4. Respecter les conventions (InnoDB, utf8mb4, DATETIME(3), noms de contraintes, `COMMENT` justifiant chaque index).
5. Appliquer sur la base de test (`npm run test:integration` recrée `jobpilot_test`) puis sur la base de dev (`npm run db:migrate`).
6. Donner l'`EXPLAIN` des requêtes que les nouveaux index doivent servir.
