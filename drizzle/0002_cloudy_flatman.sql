-- Add value column as nullable first
ALTER TABLE "auth_verification_tokens" ADD COLUMN "value" text;

-- Update existing rows to set value = token
UPDATE "auth_verification_tokens" SET "value" = "token" WHERE "value" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "auth_verification_tokens" ALTER COLUMN "value" SET NOT NULL;