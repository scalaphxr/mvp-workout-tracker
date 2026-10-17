CREATE TABLE `interval_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`title` text NOT NULL,
	`work_sec` integer NOT NULL,
	`rest_sec` integer NOT NULL,
	`rounds` integer NOT NULL,
	`cycles` integer NOT NULL,
	`cycle_rest_sec` integer NOT NULL
);
--> statement-breakpoint
-- Queues the row for sending to the server, like the triggers of the other synced tables.
CREATE TRIGGER `outbox_interval_presets_insert` AFTER INSERT ON `interval_presets`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'interval_presets', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'interval_presets' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
-- Queues the row for sending to the server, like the triggers of the other synced tables.
CREATE TRIGGER `outbox_interval_presets_update` AFTER UPDATE ON `interval_presets`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'interval_presets', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'interval_presets' AND `row_id` = NEW.`id`);
END;
