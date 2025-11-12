CREATE TABLE "validation_schedule_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vsr_id" text NOT NULL,
	"tr_id" text,
	"requested_date" timestamp NOT NULL,
	"learner_user_id" uuid NOT NULL,
	"competency_level_id" uuid NOT NULL,
	"description" text,
	"status" integer DEFAULT 0 NOT NULL,
	"response_due" timestamp,
	"response_date" timestamp,
	"definite_answer" boolean,
	"no_follow_up_date" timestamp,
	"follow_up_date" timestamp,
	"scheduled_date" timestamp,
	"validator_ops" uuid,
	"validator_trainer" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_schedule_request_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vsr_id" text NOT NULL,
	"status" integer,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validation_schedule_request" ADD CONSTRAINT "validation_schedule_request_learner_user_id_users_id_fk" FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_schedule_request" ADD CONSTRAINT "validation_schedule_request_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_schedule_request" ADD CONSTRAINT "validation_schedule_request_validator_ops_users_id_fk" FOREIGN KEY ("validator_ops") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_schedule_request" ADD CONSTRAINT "validation_schedule_request_validator_trainer_users_id_fk" FOREIGN KEY ("validator_trainer") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_schedule_request_log" ADD CONSTRAINT "validation_schedule_request_log_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "validation_schedule_request_vsr_id_idx" ON "validation_schedule_request" USING btree ("vsr_id");--> statement-breakpoint
CREATE INDEX "validation_schedule_request_learner_user_id_idx" ON "validation_schedule_request" USING btree ("learner_user_id");--> statement-breakpoint
CREATE INDEX "validation_schedule_request_competency_level_id_idx" ON "validation_schedule_request" USING btree ("competency_level_id");--> statement-breakpoint
CREATE INDEX "validation_schedule_request_validator_ops_idx" ON "validation_schedule_request" USING btree ("validator_ops");--> statement-breakpoint
CREATE INDEX "validation_schedule_request_validator_trainer_idx" ON "validation_schedule_request" USING btree ("validator_trainer");--> statement-breakpoint
CREATE INDEX "validation_schedule_request_log_vsr_id_idx" ON "validation_schedule_request_log" USING btree ("vsr_id");--> statement-breakpoint
CREATE INDEX "validation_schedule_request_log_updated_by_idx" ON "validation_schedule_request_log" USING btree ("updated_by");