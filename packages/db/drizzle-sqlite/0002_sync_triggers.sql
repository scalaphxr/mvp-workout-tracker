-- Every insert and update of a synced table queues the row for sending to the server.
-- Rows that come from the server are written with the 'applying' flag set and are not queued.
CREATE TRIGGER `outbox_gym_profiles_insert` AFTER INSERT ON `gym_profiles`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'gym_profiles', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'gym_profiles' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_gym_profiles_update` AFTER UPDATE ON `gym_profiles`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'gym_profiles', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'gym_profiles' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_gym_equipment_insert` AFTER INSERT ON `gym_equipment`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'gym_equipment', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'gym_equipment' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_gym_equipment_update` AFTER UPDATE ON `gym_equipment`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'gym_equipment', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'gym_equipment' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_programs_insert` AFTER INSERT ON `programs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'programs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'programs' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_programs_update` AFTER UPDATE ON `programs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'programs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'programs' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_program_days_insert` AFTER INSERT ON `program_days`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'program_days', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'program_days' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_program_days_update` AFTER UPDATE ON `program_days`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'program_days', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'program_days' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_program_items_insert` AFTER INSERT ON `program_items`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'program_items', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'program_items' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_program_items_update` AFTER UPDATE ON `program_items`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'program_items', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'program_items' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_program_state_insert` AFTER INSERT ON `program_state`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'program_state', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'program_state' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_program_state_update` AFTER UPDATE ON `program_state`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'program_state', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'program_state' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_progression_state_insert` AFTER INSERT ON `progression_state`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'progression_state', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'progression_state' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_progression_state_update` AFTER UPDATE ON `progression_state`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'progression_state', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'progression_state' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TRIGGER `outbox_session_exercises_insert` AFTER INSERT ON `session_exercises`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'session_exercises', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'session_exercises' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_session_exercises_update` AFTER UPDATE ON `session_exercises`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'session_exercises', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'session_exercises' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_set_logs_insert` AFTER INSERT ON `set_logs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'set_logs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'set_logs' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `outbox_set_logs_update` AFTER UPDATE ON `set_logs`
WHEN NOT EXISTS (SELECT 1 FROM `sync_state` WHERE `key` = 'applying')
BEGIN
  -- Not INSERT OR IGNORE: inside a trigger the conflict rule of the statement that fired it wins.
  INSERT INTO `outbox` (`table_name`, `row_id`)
  SELECT 'set_logs', NEW.`id`
  WHERE NOT EXISTS (SELECT 1 FROM `outbox` WHERE `table_name` = 'set_logs' AND `row_id` = NEW.`id`);
END;
--> statement-breakpoint
-- Rows created before the queue existed have never been sent.
INSERT OR IGNORE INTO `outbox` (`table_name`, `row_id`) SELECT 'gym_profiles', `id` FROM `gym_profiles`;
--> statement-breakpoint
INSERT OR IGNORE INTO `outbox` (`table_name`, `row_id`) SELECT 'gym_equipment', `id` FROM `gym_equipment`;
--> statement-breakpoint
INSERT OR IGNORE INTO `outbox` (`table_name`, `row_id`) SELECT 'programs', `id` FROM `programs`;
--> statement-breakpoint
INSERT OR IGNORE INTO `outbox` (`table_name`, `row_id`) SELECT 'program_days', `id` FROM `program_days`;
--> statement-breakpoint
INSERT OR IGNORE INTO `outbox` (`table_name`, `row_id`) SELECT 'program_items', `id` FROM `program_items`;
