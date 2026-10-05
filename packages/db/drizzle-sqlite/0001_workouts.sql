CREATE TABLE `outbox` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	PRIMARY KEY(`table_name`, `row_id`)
);
--> statement-breakpoint
CREATE TABLE `program_state` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`program_id` text NOT NULL,
	`next_day_position` integer NOT NULL,
	`cycle_number` integer NOT NULL,
	`deload_cycle` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_state_program_id_unique` ON `program_state` (`program_id`);--> statement-breakpoint
CREATE TABLE `progression_state` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`program_item_id` text NOT NULL,
	`next_weight_kg` real,
	`next_target_reps` integer NOT NULL,
	`fail_streak` integer NOT NULL,
	`reason_code` text NOT NULL,
	`reason_params` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progression_state_program_item_id_unique` ON `progression_state` (`program_item_id`);--> statement-breakpoint
CREATE TABLE `session_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`program_item_id` text,
	`exercise_id` text NOT NULL,
	`substituted_from_id` text
);
--> statement-breakpoint
CREATE INDEX `session_exercises_session_id_idx` ON `session_exercises` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_exercises_exercise_id_idx` ON `session_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`program_id` text NOT NULL,
	`program_day_id` text NOT NULL,
	`cycle_number` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`wellbeing` integer,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`session_exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`is_warmup` integer NOT NULL,
	`planned_weight_kg` real,
	`planned_rep_min` integer,
	`planned_rep_max` integer,
	`weight_kg` real,
	`reps` integer,
	`rir` integer,
	`duration_sec` integer,
	`distance_m` real,
	`speed_kmh` real,
	`incline_pct` real,
	`resistance_level` real,
	`avg_hr` integer,
	`calories` integer,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `set_logs_session_exercise_id_idx` ON `set_logs` (`session_exercise_id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
