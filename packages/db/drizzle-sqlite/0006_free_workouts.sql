PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`program_id` text,
	`program_day_id` text,
	`cycle_number` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`wellbeing` integer,
	`notes` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "created_at", "updated_at", "deleted_at", "program_id", "program_day_id", "cycle_number", "status", "started_at", "finished_at", "wellbeing", "notes") SELECT "id", "created_at", "updated_at", "deleted_at", "program_id", "program_day_id", "cycle_number", "status", "started_at", "finished_at", "wellbeing", "notes" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`,`started_at`);--> statement-breakpoint
ALTER TABLE `session_exercises` ADD `planned_sets` integer;