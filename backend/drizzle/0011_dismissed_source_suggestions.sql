CREATE TABLE "dismissed_source_suggestions" (
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"dismissed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_dismissed_source_suggestions" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "dismissed_source_suggestions" ADD CONSTRAINT "dismissed_source_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissed_source_suggestions" ADD CONSTRAINT "dismissed_source_suggestions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;