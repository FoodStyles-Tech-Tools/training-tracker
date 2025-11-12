
-- 1. Action ENUM type for activity actions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'action') THEN
    CREATE TYPE "public"."action" AS ENUM ('add', 'edit', 'delete');
  END IF;
END $$;

-- 2. Activity Log Table (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'activity_log'
  ) THEN
    CREATE TABLE "activity_log" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "module" "module_name" NOT NULL,
      "action" "action" NOT NULL,
      "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
      "data" text
    );
  END IF;
END $$;

-- 3. Foreign key on user_id to users table (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'activity_log'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'activity_log_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "activity_log"
    ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
