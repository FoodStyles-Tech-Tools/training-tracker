ALTER TYPE "public"."module_name" ADD VALUE 'competencies';--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"relevant_links" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencies_trainer" (
	"competency_id" uuid NOT NULL,
	"trainer_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competency_levels" (
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
CREATE TABLE "competency_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competency_id" uuid NOT NULL,
	"required_competency_level_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competencies_trainer" ADD CONSTRAINT "competencies_trainer_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies_trainer" ADD CONSTRAINT "competencies_trainer_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_levels" ADD CONSTRAINT "competency_levels_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_requirements" ADD CONSTRAINT "competency_requirements_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_requirements" ADD CONSTRAINT "competency_requirements_required_competency_level_id_competency_levels_id_fk" FOREIGN KEY ("required_competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competencies_trainer_pk" ON "competencies_trainer" USING btree ("competency_id","trainer_user_id");--> statement-breakpoint
CREATE INDEX "competencies_trainer_trainer_idx" ON "competencies_trainer" USING btree ("trainer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competency_levels_competency_name_idx" ON "competency_levels" USING btree ("competency_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "competency_requirements_competency_level_idx" ON "competency_requirements" USING btree ("competency_id","required_competency_level_id");--> statement-breakpoint
CREATE INDEX "competency_requirements_competency_idx" ON "competency_requirements" USING btree ("competency_id");--> statement-breakpoint
CREATE INDEX "competency_requirements_level_idx" ON "competency_requirements" USING btree ("required_competency_level_id");