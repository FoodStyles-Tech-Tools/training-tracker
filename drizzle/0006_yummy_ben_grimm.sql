CREATE TYPE "public"."user_department" AS ENUM('curator', 'scraping');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" "user_department" DEFAULT 'curator' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_calendar_tag" text;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department");