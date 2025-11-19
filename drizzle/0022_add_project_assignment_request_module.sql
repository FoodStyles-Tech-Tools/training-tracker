DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'module_name'
      AND e.enumlabel = 'project_assignment_request'
  ) THEN
    ALTER TYPE "public"."module_name" ADD VALUE 'project_assignment_request';
  END IF;
END $$;
--> statement-breakpoint

-- Create project_assignment_request table
CREATE TABLE IF NOT EXISTS "project_assignment_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "par_id" text NOT NULL,
  "requested_date" timestamp NOT NULL,
  "learner_user_id" uuid NOT NULL,
  "competency_level_id" uuid NOT NULL,
  "status" integer DEFAULT 0 NOT NULL,
  "assigned_to" uuid,
  "response_due" timestamp,
  "response_date" timestamp,
  "project_name" text,
  "description" text,
  "definite_answer" boolean,
  "no_follow_up_date" timestamp,
  "follow_up_date" timestamp,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "project_assignment_request_par_id_idx" ON "project_assignment_request" USING btree ("par_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_assignment_request_learner_user_id_idx" ON "project_assignment_request" USING btree ("learner_user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_assignment_request_competency_level_id_idx" ON "project_assignment_request" USING btree ("competency_level_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_assignment_request_assigned_to_idx" ON "project_assignment_request" USING btree ("assigned_to");
--> statement-breakpoint

-- Add foreign key constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_assignment_request_learner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "project_assignment_request" ADD CONSTRAINT "project_assignment_request_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_assignment_request_competency_level_id_competency_levels_id_fk'
  ) THEN
    ALTER TABLE "project_assignment_request" ADD CONSTRAINT "project_assignment_request_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_assignment_request_assigned_to_users_id_fk'
  ) THEN
    ALTER TABLE "project_assignment_request" ADD CONSTRAINT "project_assignment_request_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

