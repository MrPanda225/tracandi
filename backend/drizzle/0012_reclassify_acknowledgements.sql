-- T-308, EF-GML-20 (BES-31) : relecture des accusés de réception déjà classés.
-- Non destructif : deux valeurs d'énumération ajoutées (type d'exécution, compteur) et un index.
ALTER TYPE "public"."job_name" ADD VALUE 'gmail_reclassify' BEFORE 'scraper';--> statement-breakpoint
ALTER TYPE "public"."run_counter" ADD VALUE 'messages_corrected' BEFORE 'sources_checked';--> statement-breakpoint
CREATE INDEX "ix_emails_user_category" ON "emails" USING btree ("user_id","category");