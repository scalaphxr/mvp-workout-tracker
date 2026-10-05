CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "program_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"program_id" uuid NOT NULL,
	"next_day_position" integer NOT NULL,
	"cycle_number" integer NOT NULL,
	"deload_cycle" integer
);
--> statement-breakpoint
CREATE TABLE "progression_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"program_item_id" uuid NOT NULL,
	"next_weight_kg" double precision,
	"next_target_reps" integer NOT NULL,
	"fail_streak" integer DEFAULT 0 NOT NULL,
	"reason_code" text NOT NULL,
	"reason_params" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"program_item_id" uuid,
	"exercise_id" uuid NOT NULL,
	"substituted_from_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"program_id" uuid NOT NULL,
	"program_day_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"wellbeing" integer,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"planned_weight_kg" double precision,
	"planned_rep_min" integer,
	"planned_rep_max" integer,
	"weight_kg" double precision,
	"reps" integer,
	"rir" integer,
	"duration_sec" integer,
	"distance_m" double precision,
	"speed_kmh" double precision,
	"incline_pct" double precision,
	"resistance_level" double precision,
	"avg_hr" integer,
	"calories" integer,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
-- Rows that are already there take the owner of the row they belong to.
UPDATE "gym_equipment" SET "owner_id" = (SELECT "user_id" FROM "gym_profiles" WHERE "gym_profiles"."id" = "gym_equipment"."gym_profile_id");--> statement-breakpoint
ALTER TABLE "gym_equipment" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD COLUMN "sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "gym_profiles" ADD COLUMN "sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "program_days" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
-- Rows that are already there take the owner of the row they belong to.
UPDATE "program_days" SET "owner_id" = (SELECT "owner_id" FROM "programs" WHERE "programs"."id" = "program_days"."program_id");--> statement-breakpoint
ALTER TABLE "program_days" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "program_days" ADD COLUMN "sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "program_items" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
-- Rows that are already there take the owner of the row they belong to.
UPDATE "program_items" SET "owner_id" = (SELECT "owner_id" FROM "program_days" WHERE "program_days"."id" = "program_items"."program_day_id");--> statement-breakpoint
ALTER TABLE "program_items" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "program_items" ADD COLUMN "sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "program_state" ADD CONSTRAINT "program_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_state" ADD CONSTRAINT "program_state_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progression_state" ADD CONSTRAINT "progression_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progression_state" ADD CONSTRAINT "progression_state_program_item_id_program_items_id_fk" FOREIGN KEY ("program_item_id") REFERENCES "public"."program_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_substituted_from_id_exercises_id_fk" FOREIGN KEY ("substituted_from_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_program_day_id_program_days_id_fk" FOREIGN KEY ("program_day_id") REFERENCES "public"."program_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_state_sync_idx" ON "program_state" USING btree ("user_id","sync_seq");--> statement-breakpoint
CREATE INDEX "progression_state_sync_idx" ON "progression_state" USING btree ("user_id","sync_seq");--> statement-breakpoint
CREATE INDEX "session_exercises_sync_idx" ON "session_exercises" USING btree ("owner_id","sync_seq");--> statement-breakpoint
CREATE INDEX "sessions_sync_idx" ON "sessions" USING btree ("user_id","sync_seq");--> statement-breakpoint
CREATE INDEX "set_logs_sync_idx" ON "set_logs" USING btree ("owner_id","sync_seq");--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_items" ADD CONSTRAINT "program_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_equipment_sync_idx" ON "gym_equipment" USING btree ("owner_id","sync_seq");--> statement-breakpoint
CREATE INDEX "gym_profiles_sync_idx" ON "gym_profiles" USING btree ("user_id","sync_seq");--> statement-breakpoint
CREATE INDEX "program_days_sync_idx" ON "program_days" USING btree ("owner_id","sync_seq");--> statement-breakpoint
CREATE INDEX "program_items_sync_idx" ON "program_items" USING btree ("owner_id","sync_seq");--> statement-breakpoint
CREATE INDEX "programs_sync_idx" ON "programs" USING btree ("owner_id","sync_seq");