-- Add value column as nullable first
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auth_verification_tokens'
      AND column_name = 'value'
  ) THEN
    ALTER TABLE "auth_verification_tokens" ADD COLUMN "value" text;
  END IF;
END $$;

-- Update existing rows to set value = token
UPDATE "auth_verification_tokens" SET "value" = "token" WHERE "value" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "auth_verification_tokens" ALTER COLUMN "value" SET NOT NULL;