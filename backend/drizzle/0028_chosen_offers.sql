ALTER TYPE "public"."job_name" ADD VALUE 'offer_extraction';--> statement-breakpoint
ALTER TYPE "public"."llm_task" ADD VALUE 'extract_offer_traits';--> statement-breakpoint
CREATE TABLE "chosen_offers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chosen_offers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"level" "experience_level" NOT NULL,
	"title" varchar(80) NOT NULL,
	"keywords" text[] NOT NULL,
	"years" smallint,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_chosen_offers_years" CHECK ("chosen_offers"."years" is null or "chosen_offers"."years" between 0 and 50),
	CONSTRAINT "ck_chosen_offers_keywords" CHECK (cardinality("chosen_offers"."keywords") between 1 and 15)
);
--> statement-breakpoint
ALTER TABLE "chosen_offers" ADD CONSTRAINT "chosen_offers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_chosen_offers_user_level" ON "chosen_offers" USING btree ("user_id","level");