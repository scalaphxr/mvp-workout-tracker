ALTER TABLE "sessions" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "program_day_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "planned_sets" integer;