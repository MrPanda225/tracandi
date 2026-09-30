ALTER TYPE "public"."site_adapter" ADD VALUE 'france_travail';--> statement-breakpoint
ALTER TABLE "watched_sites" ALTER COLUMN "company_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_offers" ADD COLUMN "company_name" varchar(160);--> statement-breakpoint
ALTER TABLE "watched_sites" ADD COLUMN "user_id" integer;--> statement-breakpoint
-- EF-AUT-06: the sources already watched belong to the owner of their company.
UPDATE "watched_sites" SET "user_id" = "companies"."user_id" FROM "companies" WHERE "companies"."id" = "watched_sites"."company_id";--> statement-breakpoint
ALTER TABLE "watched_sites" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "watched_sites" ADD CONSTRAINT "watched_sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_watched_sites_official" ON "watched_sites" USING btree ("user_id","adapter") WHERE "watched_sites"."company_id" is null;--> statement-breakpoint
CREATE INDEX "ix_watched_sites_user" ON "watched_sites" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "watched_sites" ADD CONSTRAINT "ck_watched_sites_company" CHECK ("watched_sites"."company_id" is not null or "watched_sites"."adapter"::text in ('france_travail', 'la_bonne_alternance'));