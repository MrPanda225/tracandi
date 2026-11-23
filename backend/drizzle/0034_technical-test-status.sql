-- T-904, RG-01, RG-02, RG-04 (v1.32, BES-45) : statut et catégorie de message « Test technique ».
-- Non destructif : une valeur ajoutée à deux énumérations, placée avant « interview » pour suivre les rangs RG-04.
ALTER TYPE "public"."application_status" ADD VALUE 'technical_test' BEFORE 'interview';--> statement-breakpoint
ALTER TYPE "public"."email_category" ADD VALUE 'technical_test' BEFORE 'interview';
