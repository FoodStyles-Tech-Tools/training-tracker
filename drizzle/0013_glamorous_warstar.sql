DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'module_name'
      AND e.enumlabel = 'training_batch'
  ) THEN
    ALTER TYPE "public"."module_name" ADD VALUE 'training_batch';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competency_level_id" uuid NOT NULL,
	"trainer_user_id" uuid NOT NULL,
	"batch_name" text NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"duration_hrs" numeric,
	"estimated_start" timestamp,
	"batch_start_date" timestamp,
	"capacity" integer DEFAULT 0 NOT NULL,
	"current_participant" integer DEFAULT 0 NOT NULL,
	"spot_left" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_batch_attendance_sessions" (
	"training_batch_id" uuid NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"attended" boolean DEFAULT false NOT NULL,
	CONSTRAINT "training_batch_attendance_sessions_training_batch_id_learner_user_id_session_id_pk" PRIMARY KEY("training_batch_id","learner_user_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_batch_homework_sessions" (
	"training_batch_id" uuid NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"homework_url" text,
	CONSTRAINT "training_batch_homework_sessions_training_batch_id_learner_user_id_session_id_pk" PRIMARY KEY("training_batch_id","learner_user_id","session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_batch_learners" (
	"training_batch_id" uuid NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"training_request_id" uuid NOT NULL,
	CONSTRAINT "training_batch_learners_training_batch_id_learner_user_id_pk" PRIMARY KEY("training_batch_id","learner_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_batch_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_batch_id" uuid NOT NULL,
	"session_number" integer NOT NULL,
	"session_date" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_competency_level_id_competency_levels_id_fk'
  ) THEN
    ALTER TABLE "training_batch" ADD CONSTRAINT "training_batch_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_trainer_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "training_batch" ADD CONSTRAINT "training_batch_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_attendance_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_attendance_sessions_training_batch_id_training_batch_id_fk'
  ) THEN
    ALTER TABLE "training_batch_attendance_sessions" ADD CONSTRAINT "training_batch_attendance_sessions_training_batch_id_training_batch_id_fk" FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_attendance_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_attendance_sessions_learner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "training_batch_attendance_sessions" ADD CONSTRAINT "training_batch_attendance_sessions_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_attendance_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_attendance_sessions_session_id_training_batch_sessions_id_fk'
  ) THEN
    ALTER TABLE "training_batch_attendance_sessions" ADD CONSTRAINT "training_batch_attendance_sessions_session_id_training_batch_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_batch_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_homework_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_homework_sessions_training_batch_id_training_batch_id_fk'
  ) THEN
    ALTER TABLE "training_batch_homework_sessions" ADD CONSTRAINT "training_batch_homework_sessions_training_batch_id_training_batch_id_fk" FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_homework_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_homework_sessions_learner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "training_batch_homework_sessions" ADD CONSTRAINT "training_batch_homework_sessions_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_homework_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_homework_sessions_session_id_training_batch_sessions_id_fk'
  ) THEN
    ALTER TABLE "training_batch_homework_sessions" ADD CONSTRAINT "training_batch_homework_sessions_session_id_training_batch_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_batch_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_learners'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_learners_training_batch_id_training_batch_id_fk'
  ) THEN
    ALTER TABLE "training_batch_learners" ADD CONSTRAINT "training_batch_learners_training_batch_id_training_batch_id_fk" FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_learners'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_learners_learner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "training_batch_learners" ADD CONSTRAINT "training_batch_learners_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_learners'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_learners_training_request_id_training_request_id_fk'
  ) THEN
    ALTER TABLE "training_batch_learners" ADD CONSTRAINT "training_batch_learners_training_request_id_training_request_id_fk" FOREIGN KEY ("training_request_id") REFERENCES "public"."training_request"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'training_batch_sessions'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'training_batch_sessions_training_batch_id_training_batch_id_fk'
  ) THEN
    ALTER TABLE "training_batch_sessions" ADD CONSTRAINT "training_batch_sessions_training_batch_id_training_batch_id_fk" FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_competency_level_id_idx" ON "training_batch" USING btree ("competency_level_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_trainer_user_id_idx" ON "training_batch" USING btree ("trainer_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_attendance_learner_user_id_idx" ON "training_batch_attendance_sessions" USING btree ("learner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_attendance_session_id_idx" ON "training_batch_attendance_sessions" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_homework_learner_user_id_idx" ON "training_batch_homework_sessions" USING btree ("learner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_homework_session_id_idx" ON "training_batch_homework_sessions" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_learners_training_request_id_idx" ON "training_batch_learners" USING btree ("training_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_learners_learner_user_id_idx" ON "training_batch_learners" USING btree ("learner_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "training_batch_sessions_batch_session_idx" ON "training_batch_sessions" USING btree ("training_batch_id","session_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_batch_sessions_training_batch_id_idx" ON "training_batch_sessions" USING btree ("training_batch_id");