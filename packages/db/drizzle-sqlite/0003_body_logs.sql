CREATE TABLE `body_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`measured_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `body_logs_date_idx` ON `body_logs` (`date`);
--> statement-breakpoint
-- Queues the row for sending to the server, like the triggers of the other synced tables.
CREATE TRIGGER `outbox_body_logs_insert` AFTER INSERT ON `body_logs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'body_logs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'body_logs' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
-- Queues the row for sending to the server, like the triggers of the other synced tables.
CREATE TRIGGER `outbox_body_logs_update` AFTER UPDATE ON `body_logs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'body_logs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'body_logs' AND `row_id` = NEW.`id`);
END;
