DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'module_name'
      AND e.enumlabel = 'competencies'
  ) THEN
    ALTER TYPE "public"."module_name" ADD VALUE 'competencies';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"relevant_links" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competencies_trainer" (
	"competency_id" uuid NOT NULL,
	"trainer_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competency_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"training_plan_document" text NOT NULL,
	"team_knowledge" text NOT NULL,
	"eligibility_criteria" text NOT NULL,
	"verification" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competency_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competency_id" uuid NOT NULL,
	"required_competency_level_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competencies_trainer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'competencies_trainer_competency_id_competencies_id_fk'
  ) THEN
    ALTER TABLE "competencies_trainer" ADD CONSTRAINT "competencies_trainer_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competencies_trainer'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'competencies_trainer_trainer_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "competencies_trainer" ADD CONSTRAINT "competencies_trainer_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competency_levels'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'competency_levels_competency_id_competencies_id_fk'
  ) THEN
    ALTER TABLE "competency_levels" ADD CONSTRAINT "competency_levels_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competency_requirements'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'competency_requirements_competency_id_competencies_id_fk'
  ) THEN
    ALTER TABLE "competency_requirements" ADD CONSTRAINT "competency_requirements_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competency_requirements'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'competency_requirements_required_competency_level_id_competency_levels_id_fk'
  ) THEN
    ALTER TABLE "competency_requirements" ADD CONSTRAINT "competency_requirements_required_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("required_competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'competencies_trainer_pk'
  ) THEN
    CREATE UNIQUE INDEX "competencies_trainer_pk" ON "competencies_trainer" USING btree ("competency_id","trainer_user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'competencies_trainer_trainer_idx'
  ) THEN
    CREATE INDEX "competencies_trainer_trainer_idx" ON "competencies_trainer" USING btree ("trainer_user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'competency_levels_competency_name_idx'
  ) THEN
    CREATE UNIQUE INDEX "competency_levels_competency_name_idx" ON "competency_levels" USING btree ("competency_id","name");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'competency_requirements_competency_level_idx'
  ) THEN
    CREATE UNIQUE INDEX "competency_requirements_competency_level_idx" ON "competency_requirements" USING btree ("competency_id","required_competency_level_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'competency_requirements_competency_idx'
  ) THEN
    CREATE INDEX "competency_requirements_competency_idx" ON "competency_requirements" USING btree ("competency_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'competency_requirements_level_idx'
  ) THEN
    CREATE INDEX "competency_requirements_level_idx" ON "competency_requirements" USING btree ("required_competency_level_id");
  END IF;
END $$;