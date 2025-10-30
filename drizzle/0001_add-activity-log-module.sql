CREATE TYPE "public"."action" AS ENUM('add', 'edit', 'delete');--> statement-breakpoint
ALTER TYPE "public"."module_name" ADD VALUE 'activity_log';--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"module" "module_name" NOT NULL,
	"action" "action" NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"data" text
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
