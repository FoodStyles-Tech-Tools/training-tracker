-- Drizzle Migration: Create Activity Log Table

-- 1. Action ENUM type for activity actions
CREATE TYPE "public"."action" AS ENUM ('add', 'edit', 'delete');

-- 2. Activity Log Table
CREATE TABLE "activity_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "module" "module_name" NOT NULL,
    "action" "action" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    "data" text
);

-- 3. Foreign key on user_id to users table
ALTER TABLE "activity_log"
ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
