-- Create custom_numbering table if it doesn't exist
CREATE TABLE IF NOT EXISTS "custom_numbering" (
	"module" text PRIMARY KEY NOT NULL,
	"running_number" integer NOT NULL
);

-- Create training_request table if it doesn't exist
CREATE TABLE IF NOT EXISTS "training_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tr_id" text NOT NULL,
	"requested_date" timestamp NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"competency_level_id" uuid NOT NULL,
	"training_batch_id" uuid,
	"status" integer DEFAULT 0 NOT NULL,
	"on_hold_by" integer,
	"on_hold_reason" text,
	"drop_off_reason" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"blocked_reason" text,
	"expected_unblocked_date" timestamp,
	"notes" text,
	"assigned_to" uuid,
	"response_due" timestamp,
	"response_date" timestamp,
	"definite_answer" boolean,
	"no_follow_up_date" timestamp,
	"follow_up_date" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'training_request_learner_user_id_users_id_fk'
	) THEN
		ALTER TABLE "training_request" ADD CONSTRAINT "training_request_learner_user_id_users_id_fk" 
		FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'training_request_competency_level_id_competency_levels_id_fk'
	) THEN
		ALTER TABLE "training_request" ADD CONSTRAINT "training_request_competency_level_id_competency_levels_id_fk" 
		FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'training_request_assigned_to_users_id_fk'
	) THEN
		ALTER TABLE "training_request" ADD CONSTRAINT "training_request_assigned_to_users_id_fk" 
		FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;

-- Create indexes if they don't exist
CREATE UNIQUE INDEX IF NOT EXISTS "training_request_tr_id_idx" ON "training_request" USING btree ("tr_id");
CREATE INDEX IF NOT EXISTS "training_request_learner_user_id_idx" ON "training_request" USING btree ("learner_user_id");
CREATE INDEX IF NOT EXISTS "training_request_competency_level_id_idx" ON "training_request" USING btree ("competency_level_id");
CREATE INDEX IF NOT EXISTS "training_request_training_batch_id_idx" ON "training_request" USING btree ("training_batch_id");
CREATE INDEX IF NOT EXISTS "training_request_assigned_to_idx" ON "training_request" USING btree ("assigned_to");
