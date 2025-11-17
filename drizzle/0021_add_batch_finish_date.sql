DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'training_batch')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'training_batch' AND column_name = 'batch_finish_date') THEN
    ALTER TABLE "training_batch" ADD COLUMN "batch_finish_date" timestamp;
  END IF;
END $$;

