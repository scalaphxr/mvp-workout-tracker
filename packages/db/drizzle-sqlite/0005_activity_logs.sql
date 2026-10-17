CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`activity_type` text NOT NULL,
	`started_at` text NOT NULL,
	`duration_sec` integer NOT NULL,
	`intensity` integer,
	`distance_m` real,
	`avg_hr` integer,
	`calories` integer,
	`notes` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_logs_started_at_idx` ON `activity_logs` (`started_at`);--> statement-breakpoint
-- Queues the row for sending to the server, like the triggers of the other synced tables.
CREATE TRIGGER `outbox_activity_logs_insert` AFTER INSERT ON `activity_logs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'activity_logs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'activity_logs' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
-- Queues the row for sending to the server, like the triggers of the other synced tables.
CREATE TRIGGER `outbox_activity_logs_update` AFTER UPDATE ON `activity_logs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'activity_logs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'activity_logs' AND `row_id` = NEW.`id`);
END;
