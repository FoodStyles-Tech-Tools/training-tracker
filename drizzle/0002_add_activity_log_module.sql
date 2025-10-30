-- Drizzle Migration: Add activity_log module entry

ALTER TYPE "module_name" ADD VALUE IF NOT EXISTS 'activity_log';

