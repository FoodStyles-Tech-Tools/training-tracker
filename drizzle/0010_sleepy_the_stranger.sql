CREATE TABLE IF NOT EXISTS "user_competency_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"competency_level_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_competency_progress'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_competency_progress_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "user_competency_progress" ADD CONSTRAINT "user_competency_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_competency_progress'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_competency_progress_competency_level_id_competency_levels_id_fk'
  ) THEN
    ALTER TABLE "user_competency_progress" ADD CONSTRAINT "user_competency_progress_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_competency_progress'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'user_competency_progress_verified_by_users_id_fk'
  ) THEN
    ALTER TABLE "user_competency_progress" ADD CONSTRAINT "user_competency_progress_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_competency_progress_user_level_idx'
  ) THEN
    CREATE UNIQUE INDEX "user_competency_progress_user_level_idx" ON "user_competency_progress" USING btree ("user_id","competency_level_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_competency_progress_user_idx'
  ) THEN
    CREATE INDEX "user_competency_progress_user_idx" ON "user_competency_progress" USING btree ("user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_competency_progress_level_idx'
  ) THEN
    CREATE INDEX "user_competency_progress_level_idx" ON "user_competency_progress" USING btree ("competency_level_id");
  END IF;
END $$;