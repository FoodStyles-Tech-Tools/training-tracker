DROP INDEX IF EXISTS "competencies_trainer_pk";
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'competencies_trainer_competency_id_trainer_user_id_pk'
  ) THEN
    ALTER TABLE "competencies_trainer" ADD CONSTRAINT "competencies_trainer_competency_id_trainer_user_id_pk" PRIMARY KEY("competency_id","trainer_user_id");
  END IF;
END $$;