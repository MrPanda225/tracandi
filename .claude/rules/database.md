---
paths:
  - "database/**"
  - "backend/src/db/**"
  - "backend/drizzle/**"
  - "backend/src/modules/**/repository.ts"
  - "backend/tests/integration/**"
  - "scripts/db/**"
---
# Règles base de données (PostgreSQL / Neon, Drizzle ORM)

Environnement : **PostgreSQL hébergé par Neon (région UE), base < 0,5 Go, RPO 24 h, RTO 30 min** (cahier des charges
§7.3, C-02, C-09, ADR-02, ADR-03, ADR-11, ADR-12).
*Transition* : `scripts/db/` est encore en version MySQL ; il est remplacé en T-701.

## Schéma
- Source de vérité : `backend/src/db/schema.ts` (Drizzle). Toute évolution = modification de `schema.ts`
  + `npx drizzle-kit generate --name <description>` → migration SQL dans `backend/drizzle/`, **relue** puis commitée.
- **Une migration commitée n'est jamais modifiée** (bloqué par hook) : générer la suivante (`/project:new-migration`).
  `drizzle-kit push` est interdit (pas d'historique).
- Conventions : `id` en `integer generated always as identity` (`bigint` pour `llm_calls`), dates
  `timestamp(3) with time zone` en UTC, `jsonb`, énumérations `pgEnum`, snake_case côté base (camelCase côté TypeScript),
  contraintes nommées `uq_<table>_<cols>`, `ix_<table>_<cols>`, `ck_<table>_<règle>`, `pk_<table>` (clés composées) ;
  clés étrangères simples : nom généré par Drizzle (`<table>_<colonne>_<cible>_<colonne>_fk`), composées : `fk_<table>_<cible>`.
- Toute colonne de filtre, de jointure ou de tri fréquente est indexée ; chaque index est justifié par un commentaire
  citant l'exigence qu'il sert (`// EF-CAN-04`). Pas d'index « au cas où ». Recherche par sous-chaîne : index GIN `pg_trgm`.
- Une migration destructive (`DROP`, suppression de colonne, changement de type réduisant les données) exige l'accord
  explicite du Business Owner.

## Requêtes (repositories)
- **Uniquement par l'API Drizzle** (`db.select()...`, `db.insert()...`) : valeurs toujours paramétrées (ENF-SEC-05,
  ENF-SEC-16). `sql.raw()` est interdit ; le gabarit `sql\`...\`` n'est admis que pour une expression que l'API ne sait pas
  écrire, avec des valeurs interpolées (jamais de chaîne assemblée).
- Un tri ou un filtre dynamique choisi par l'utilisateur passe par une liste blanche de colonnes Drizzle, jamais par un nom reçu.
- Aucun import de `pg` ni du client Drizzle hors de `src/db/` et des `repository.ts`.
- Colonnes nommées dans chaque `select` (pas de `select()` sans argument sur les grandes tables).
- Écritures multi-tables dans `db.transaction()` ; `for('update')` si lecture-puis-écriture concurrente.
- Upsert : `onConflictDoUpdate` / `onConflictDoNothing` sur une contrainte unique.
- Pagination bornée (`limit` ≤ 500).
- Toute nouvelle requête de lecture sur `applications`, `emails`, `job_offers` est vérifiée par `EXPLAIN` (SQL obtenu par
  `.toSQL()`) sur le PostgreSQL local avec un volume représentatif : `Seq Scan` sur une grande table → corriger l'index
  (ENF-PERF-04). Coller l'`EXPLAIN` dans la description du commit quand un index est créé.

## Rôles (moindre privilège, ENF-SEC-09, ENF-SEC-17)
- Backend : `tracandi_app` (DML seulement, `DATABASE_URL_APP`). Migrations : `tracandi_owner` (`DATABASE_URL_MIGRATOR`,
  service `migrate` uniquement). Sauvegarde : `tracandi_backup` (lecture seule). Jamais le rôle propriétaire dans le backend.
- Connexion à Neon toujours en `sslmode=verify-full` (ENF-SEC-15) ; une URL sans ce paramètre fait échouer le démarrage.

## Tests d'intégration
- PostgreSQL **local** en Docker, base `tracandi_test`, migrations appliquées au début de la suite ;
  tables vidées entre tests (`TRUNCATE ... RESTART IDENTITY CASCADE`).
- Jamais de test ni de commande de Claude Code sur la base Neon (données réelles).

## Sauvegarde / restauration (T-701)
- `pg_dump` quotidien de Neon vers le poste (rôle `tracandi_backup`, rétention 30 j), restauration de contrôle dans le
  PostgreSQL local. La restauration vers Neon est destructive : **jamais exécutée par Claude Code**.
- Opérations destructives : afficher d'abord ce qui sera touché (`SELECT count(*)`, `SELECT current_database()`),
  demander confirmation.
