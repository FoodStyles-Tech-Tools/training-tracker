-- Change activity_log.action from enum to text to accept any action value
DO $$ 
DECLARE
  col_type text;
BEGIN
  -- Get the current column type
  SELECT udt_name INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'activity_log'
    AND column_name = 'action';
  
  -- Check if it's an enum type (action enum)
  IF col_type = 'action' THEN
    -- Alter the column type from enum to text
    ALTER TABLE "activity_log" ALTER COLUMN "action" TYPE text USING "action"::text;
  END IF;
END $$;

