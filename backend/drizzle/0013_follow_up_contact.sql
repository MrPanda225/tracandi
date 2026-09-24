-- T-310, RG-20, EF-CAN-17 (BES-34) : adresse de contact des messages et tâche IA de relance.
-- Non destructif : une colonne facultative, une valeur d'énumération et un index partiel ajoutés.
ALTER TYPE "public"."llm_task" ADD VALUE 'write_follow_up';--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "contact_address" varchar(320);--> statement-breakpoint
CREATE INDEX "ix_emails_user_without_contact" ON "emails" USING btree ("user_id") WHERE "emails"."contact_address" is null;