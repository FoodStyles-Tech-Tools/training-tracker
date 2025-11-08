ALTER TABLE "auth_accounts" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "auth_accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;