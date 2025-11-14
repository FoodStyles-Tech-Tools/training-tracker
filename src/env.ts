import "dotenv/config";
import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_PROD: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  ADMIN_SEED_EMAIL: z.string().email().optional(),
  ADMIN_SEED_PASSWORD: z.string().min(8).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NEXT_PUBLIC_PASSWORD_LOGIN_DISABLED: z.string().optional(),
  TRAINING_REQUEST_STATUS: z
    .string()
    .default([
      "Not Started", // 0
      "Looking for trainer", // 1
      "In Queue", // 2
      "No batch match", // 3
      "In Progress", // 4
      "Sessions Completed", // 5
      "On Hold", // 6
      "Drop Off", // 7
      "Training Completed", // 8
    ].join(",")),
  VPA_STATUS: z
    .string()
    .default([
      "Pending Validation Project Approval", // 0
      "Approved", // 1
      "Rejected", // 2
      "Resubmit for Re-validation", // 3
    ].join(",")),
  VSR_STATUS: z
    .string()
    .default([
      "Pending Validation", // 0
      "Pending Re-validation", // 1
      "Validation Scheduled", // 2
      "Fail", // 3
      "Pass", // 4
    ].join(",")),
});

const parsed = serverSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_PROD: process.env.DATABASE_URL_PROD,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  ADMIN_SEED_EMAIL: process.env.ADMIN_SEED_EMAIL,
  ADMIN_SEED_PASSWORD: process.env.ADMIN_SEED_PASSWORD,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  NEXT_PUBLIC_PASSWORD_LOGIN_DISABLED: process.env.NEXT_PUBLIC_PASSWORD_LOGIN_DISABLED,
  TRAINING_REQUEST_STATUS: process.env.TRAINING_REQUEST_STATUS,
  VPA_STATUS: process.env.VPA_STATUS,
  VSR_STATUS: process.env.VSR_STATUS,
});

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const formErrors = parsed.error.flatten().formErrors;
  console.error("Invalid environment variables", {
    fieldErrors,
    formErrors,
    issues: parsed.error.issues,
  });
  throw new Error(`Invalid environment variables: ${JSON.stringify({ fieldErrors, formErrors })}`);
}

export const env = parsed.data;
export const appBaseUrl = env.NEXT_PUBLIC_APP_URL;
