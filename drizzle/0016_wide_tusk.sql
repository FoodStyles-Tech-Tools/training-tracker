DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'validation_project_approval_log')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'validation_project_approval_log' AND column_name = 'rejection_reason') THEN
    ALTER TABLE "validation_project_approval_log" ADD COLUMN "rejection_reason" text;
  END IF;
END $$;