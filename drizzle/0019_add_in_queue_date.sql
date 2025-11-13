DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'training_request')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'training_request' AND column_name = 'in_queue_date') THEN
    ALTER TABLE "training_request" ADD COLUMN "in_queue_date" timestamp;
  END IF;
END $$;

