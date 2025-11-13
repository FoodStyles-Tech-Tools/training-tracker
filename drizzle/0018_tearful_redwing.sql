DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'module_name'
      AND e.enumlabel = 'training_request'
  ) THEN
    ALTER TYPE "public"."module_name" ADD VALUE 'training_request';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'module_name'
      AND e.enumlabel = 'validation_project_approval'
  ) THEN
    ALTER TYPE "public"."module_name" ADD VALUE 'validation_project_approval';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'module_name'
      AND e.enumlabel = 'validation_schedule_request'
  ) THEN
    ALTER TYPE "public"."module_name" ADD VALUE 'validation_schedule_request';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_schedule_request')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'validation_schedule_request' AND column_name = 'assigned_to') THEN
    ALTER TABLE "validation_schedule_request" ADD COLUMN "assigned_to" uuid;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_schedule_request')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'validation_schedule_request' AND column_name = 'assigned_to')
    AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'validation_schedule_request_assigned_to_users_id_fk') THEN
    ALTER TABLE "validation_schedule_request" ADD CONSTRAINT "validation_schedule_request_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_schedule_request')
    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'validation_schedule_request_assigned_to_idx') THEN
CREATE INDEX "validation_schedule_request_assigned_to_idx" ON "validation_schedule_request" USING btree ("assigned_to");
  END IF;
END $$;