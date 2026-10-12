CREATE TABLE "account_activations" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_account_activations_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activated_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "account_activations" ADD CONSTRAINT "account_activations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;