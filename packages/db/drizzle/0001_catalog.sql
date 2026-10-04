CREATE TABLE "catalog_versions" (
	"version" integer PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"category" text NOT NULL,
	"default_increment_kg" double precision,
	"default_increment_lb" double precision,
	CONSTRAINT "equipment_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exercise_aliases" (
	"exercise_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "exercise_aliases_exercise_id_locale_alias_pk" PRIMARY KEY("exercise_id","locale","alias")
);
--> statement-breakpoint
CREATE TABLE "exercise_alternatives" (
	"exercise_id" uuid NOT NULL,
	"alt_exercise_id" uuid NOT NULL,
	"weight_ratio" double precision,
	"priority" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exercise_alternatives_exercise_id_alt_exercise_id_pk" PRIMARY KEY("exercise_id","alt_exercise_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_equipment" (
	"exercise_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	CONSTRAINT "exercise_equipment_exercise_id_equipment_id_pk" PRIMARY KEY("exercise_id","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_media" (
	"exercise_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"video_id" text NOT NULL,
	"start_sec" integer DEFAULT 0 NOT NULL,
	"lang" text NOT NULL,
	CONSTRAINT "exercise_media_exercise_id_provider_video_id_pk" PRIMARY KEY("exercise_id","provider","video_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_muscles" (
	"exercise_id" uuid NOT NULL,
	"muscle_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "exercise_muscles_exercise_id_muscle_id_pk" PRIMARY KEY("exercise_id","muscle_id")
);
--> statement-breakpoint
CREATE TABLE "exercise_translations" (
	"exercise_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"technique_steps" jsonb NOT NULL,
	"common_mistakes" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	CONSTRAINT "exercise_translations_exercise_id_locale_pk" PRIMARY KEY("exercise_id","locale")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"slug" text NOT NULL,
	"owner_id" uuid,
	"kind" text NOT NULL,
	"tracking" text NOT NULL,
	"movement_pattern" text NOT NULL,
	"mechanics" text NOT NULL,
	"level" text NOT NULL,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "muscles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"svg_region" text NOT NULL,
	"svg_side" text NOT NULL,
	CONSTRAINT "muscles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "exercise_aliases" ADD CONSTRAINT "exercise_aliases_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_alternatives" ADD CONSTRAINT "exercise_alternatives_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_alternatives" ADD CONSTRAINT "exercise_alternatives_alt_exercise_id_exercises_id_fk" FOREIGN KEY ("alt_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment" ADD CONSTRAINT "exercise_equipment_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_equipment" ADD CONSTRAINT "exercise_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_id_muscles_id_fk" FOREIGN KEY ("muscle_id") REFERENCES "public"."muscles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_translations" ADD CONSTRAINT "exercise_translations_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;