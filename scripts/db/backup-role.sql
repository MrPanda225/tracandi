-- Droits du rôle de sauvegarde tracandi_backup : lecture seule (ARCHITECTURE.md §5, ENF-SEC-09, ENF-SEC-17).
-- À exécuter par l'exploitant, une fois, dans l'éditeur SQL de Neon, connecté avec le rôle PROPRIÉTAIRE des tables
-- (celui de DATABASE_URL_MIGRATOR), APRÈS avoir créé le rôle avec son mot de passe (jamais écrit dans le dépôt) :
--   CREATE ROLE tracandi_backup WITH LOGIN PASSWORD '<mot de passe généré, 60 bits d''entropie au moins>';
-- Rejouable sans effet de bord. Rien ici ne permet d'écrire : ni INSERT, ni UPDATE, ni DELETE, ni DDL.
-- Le test backend/tests/integration/backup-restore.test.ts applique ce même fichier sur une base locale.

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tracandi_backup', current_database());
END
$$;

-- Schéma de l'application.
GRANT USAGE ON SCHEMA public TO tracandi_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tracandi_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO tracandi_backup;
-- Tables et séquences créées plus tard par les migrations (même rôle propriétaire que celui qui exécute ce fichier).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO tracandi_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO tracandi_backup;

-- Journal des migrations de drizzle-kit : sauvegardé pour qu'une base restaurée sache quelles migrations rejouer.
GRANT USAGE ON SCHEMA drizzle TO tracandi_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO tracandi_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO tracandi_backup;
