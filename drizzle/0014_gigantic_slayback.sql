DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval') THEN
    CREATE TABLE "validation_project_approval" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "vpa_id" text NOT NULL,
      "tr_id" text,
      "requested_date" timestamp,
      "learner_user_id" uuid NOT NULL,
      "competency_level_id" uuid NOT NULL,
      "project_details" text,
      "status" integer DEFAULT 0 NOT NULL,
      "assigned_to" uuid,
      "response_due" timestamp,
      "response_date" timestamp,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval_log') THEN
    CREATE TABLE "validation_project_approval_log" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "vpa_id" text NOT NULL,
      "status" integer,
      "project_details_text" text,
      "updated_by" uuid,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'validation_project_approval_learner_user_id_users_id_fk') THEN
    ALTER TABLE "validation_project_approval" ADD CONSTRAINT "validation_project_approval_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'validation_project_approval_competency_level_id_competency_levels_id_fk') THEN
    ALTER TABLE "validation_project_approval" ADD CONSTRAINT "validation_project_approval_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'validation_project_approval_assigned_to_users_id_fk') THEN
    ALTER TABLE "validation_project_approval" ADD CONSTRAINT "validation_project_approval_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval_log')
    AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'validation_project_approval_log_updated_by_users_id_fk') THEN
    ALTER TABLE "validation_project_approval_log" ADD CONSTRAINT "validation_project_approval_log_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_project_approval_vpa_id_idx') THEN
    CREATE UNIQUE INDEX "validation_project_approval_vpa_id_idx" ON "validation_project_approval" USING btree ("vpa_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_project_approval_learner_user_id_idx') THEN
    CREATE INDEX "validation_project_approval_learner_user_id_idx" ON "validation_project_approval" USING btree ("learner_user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_project_approval_competency_level_id_idx') THEN
    CREATE INDEX "validation_project_approval_competency_level_id_idx" ON "validation_project_approval" USING btree ("competency_level_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_project_approval_assigned_to_idx') THEN
    CREATE INDEX "validation_project_approval_assigned_to_idx" ON "validation_project_approval" USING btree ("assigned_to");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval_log')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_project_approval_log_vpa_id_idx') THEN
    CREATE INDEX "validation_project_approval_log_vpa_id_idx" ON "validation_project_approval_log" USING btree ("vpa_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval_log')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_project_approval_log_updated_by_idx') THEN
    CREATE INDEX "validation_project_approval_log_updated_by_idx" ON "validation_project_approval_log" USING btree ("updated_by");
  END IF;
END $$;