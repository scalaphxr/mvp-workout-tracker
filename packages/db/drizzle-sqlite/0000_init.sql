CREATE TABLE `gym_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`gym_profile_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`increment_kg` real
);
--> statement-breakpoint
CREATE INDEX `gym_equipment_gym_profile_id_idx` ON `gym_equipment` (`gym_profile_id`);--> statement-breakpoint
CREATE TABLE `gym_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`location_type` text NOT NULL,
	`is_default` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`program_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `program_days_program_id_idx` ON `program_days` (`program_id`);--> statement-breakpoint
CREATE TABLE `program_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`program_day_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`sets` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`rest_sec` integer NOT NULL,
	`target_rir` integer,
	`superset_group` integer,
	`increment_kg` real,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `program_items_program_day_id_idx` ON `program_items` (`program_day_id`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`goal` text,
	`level` text,
	`days_per_week` integer,
	`visibility` text NOT NULL,
	`forked_from_id` text
);
