-- Rebuilding `sessions` in 0006 took its outbox triggers with it.
CREATE TRIGGER `outbox_sessions_insert` AFTER INSERT ON `sessions`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'sessions', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'sessions' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_sessions_update` AFTER UPDATE ON `sessions`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'sessions', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'sessions' AND `row_id` = NEW.`id`);
END;
