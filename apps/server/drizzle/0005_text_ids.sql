-- Every id becomes a slug made from the name. Needs the `slugify(text, fallback)`
-- SQL function that db/index.ts registers, so it only runs through the server.
-- Duplicates within a scope (a room, or all rooms) get "-<old id>" appended.
DROP INDEX `rooms_name_unique`;--> statement-breakpoint
DROP INDEX `rooms_single_active`;--> statement-breakpoint
DROP INDEX `fixtures_room_name_unique`;--> statement-breakpoint
DROP INDEX `fixtures_room_address`;--> statement-breakpoint
DROP INDEX `targets_room_slug_unique`;--> statement-breakpoint
DROP INDEX `effects_room_name_unique`;--> statement-breakpoint
DROP INDEX `scenes_room_name_unique`;--> statement-breakpoint
DROP INDEX `cues_room_position`;--> statement-breakpoint
ALTER TABLE `rooms` RENAME TO `rooms_old`;--> statement-breakpoint
ALTER TABLE `fixtures` RENAME TO `fixtures_old`;--> statement-breakpoint
ALTER TABLE `targets` RENAME TO `targets_old`;--> statement-breakpoint
ALTER TABLE `target_positions` RENAME TO `target_positions_old`;--> statement-breakpoint
ALTER TABLE `effects` RENAME TO `effects_old`;--> statement-breakpoint
ALTER TABLE `scenes` RENAME TO `scenes_old`;--> statement-breakpoint
ALTER TABLE `cues` RENAME TO `cues_old`;--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`width` real,
	`depth` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_single_active` ON `rooms` (`active`) WHERE "rooms"."active" = 1;--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`address` integer NOT NULL,
	`x` real,
	`y` real,
	`height` real,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixtures_room_name_unique` ON `fixtures` (`room_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `fixtures_room_address` ON `fixtures` (`room_id`,`address`);--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `target_positions` (
	`room_id` text NOT NULL,
	`target_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`pan` integer NOT NULL,
	`tilt` integer NOT NULL,
	PRIMARY KEY(`room_id`, `target_id`, `fixture_id`),
	FOREIGN KEY (`room_id`,`target_id`) REFERENCES `targets`(`room_id`,`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`room_id`,`fixture_id`) REFERENCES `fixtures`(`room_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `effects` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`generator` text NOT NULL,
	`params` text NOT NULL,
	`pad` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `effects_room_name_unique` ON `effects` (`room_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`look` text NOT NULL,
	`effects` text NOT NULL,
	`fade` real DEFAULT 2 NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_room_name_unique` ON `scenes` (`room_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `cues` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`scene_id` text NOT NULL,
	`fade` real,
	`trigger` text DEFAULT 'go' NOT NULL,
	`delay` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`,`scene_id`) REFERENCES `scenes`(`room_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cues_room_position` ON `cues` (`room_id`,`position`);--> statement-breakpoint
CREATE TABLE `_room_ids` AS SELECT `id` AS `old`, slugify(`name`, 'room') || CASE WHEN row_number() OVER (PARTITION BY slugify(`name`, 'room') ORDER BY `id`) > 1 THEN '-' || `id` ELSE '' END AS `new` FROM `rooms_old`;--> statement-breakpoint
CREATE TABLE `_fixture_ids` AS SELECT `id` AS `old`, `room_id` AS `room`, slugify(`name`, 'fixture') || CASE WHEN row_number() OVER (PARTITION BY `room_id`, slugify(`name`, 'fixture') ORDER BY `id`) > 1 THEN '-' || `id` ELSE '' END AS `new` FROM `fixtures_old`;--> statement-breakpoint
CREATE TABLE `_effect_ids` AS SELECT `id` AS `old`, `room_id` AS `room`, slugify(`name`, 'effect') || CASE WHEN row_number() OVER (PARTITION BY `room_id`, slugify(`name`, 'effect') ORDER BY `id`) > 1 THEN '-' || `id` ELSE '' END AS `new` FROM `effects_old`;--> statement-breakpoint
CREATE TABLE `_scene_ids` AS SELECT `id` AS `old`, `room_id` AS `room`, slugify(`name`, 'scene') || CASE WHEN row_number() OVER (PARTITION BY `room_id`, slugify(`name`, 'scene') ORDER BY `id`) > 1 THEN '-' || `id` ELSE '' END AS `new` FROM `scenes_old`;--> statement-breakpoint
CREATE TABLE `_cue_ids` AS SELECT `id` AS `old`, `room_id` AS `room`, slugify(`name`, 'cue') || CASE WHEN row_number() OVER (PARTITION BY `room_id`, slugify(`name`, 'cue') ORDER BY `id`) > 1 THEN '-' || `id` ELSE '' END AS `new` FROM `cues_old`;--> statement-breakpoint
INSERT INTO `rooms` (`id`, `name`, `active`, `width`, `depth`) SELECT m.`new`, o.`name`, o.`active`, o.`width`, o.`depth` FROM `rooms_old` o JOIN `_room_ids` m ON m.`old` = o.`id`;--> statement-breakpoint
INSERT INTO `fixtures` (`id`, `room_id`, `name`, `type`, `address`, `x`, `y`, `height`) SELECT m.`new`, r.`new`, o.`name`, o.`type`, o.`address`, o.`x`, o.`y`, o.`height` FROM `fixtures_old` o JOIN `_fixture_ids` m ON m.`old` = o.`id` JOIN `_room_ids` r ON r.`old` = o.`room_id`;--> statement-breakpoint
INSERT INTO `targets` (`id`, `room_id`, `name`) SELECT o.`slug`, r.`new`, o.`name` FROM `targets_old` o JOIN `_room_ids` r ON r.`old` = o.`room_id`;--> statement-breakpoint
INSERT INTO `target_positions` (`room_id`, `target_id`, `fixture_id`, `pan`, `tilt`) SELECT r.`new`, t.`slug`, f.`new`, p.`pan`, p.`tilt` FROM `target_positions_old` p JOIN `targets_old` t ON t.`id` = p.`target_id` JOIN `_room_ids` r ON r.`old` = t.`room_id` JOIN `_fixture_ids` f ON f.`old` = p.`fixture_id`;--> statement-breakpoint
INSERT INTO `effects` (`id`, `room_id`, `name`, `generator`, `params`, `pad`) SELECT m.`new`, r.`new`, o.`name`, o.`generator`, o.`params`, o.`pad` FROM `effects_old` o JOIN `_effect_ids` m ON m.`old` = o.`id` JOIN `_room_ids` r ON r.`old` = o.`room_id`;--> statement-breakpoint
INSERT INTO `scenes` (`id`, `room_id`, `name`, `tag`, `look`, `effects`, `fade`) SELECT m.`new`, r.`new`, o.`name`, o.`tag`, o.`look`, (SELECT json_group_array(json(x)) FROM (SELECT json_set(j.`value`, '$.effectId', e.`new`) AS x FROM json_each(o.`effects`) j JOIN `_effect_ids` e ON e.`room` = o.`room_id` AND e.`old` = json_extract(j.`value`, '$.effectId') ORDER BY j.`key`)), o.`fade` FROM `scenes_old` o JOIN `_scene_ids` m ON m.`old` = o.`id` JOIN `_room_ids` r ON r.`old` = o.`room_id`;--> statement-breakpoint
INSERT INTO `cues` (`id`, `room_id`, `position`, `name`, `scene_id`, `fade`, `trigger`, `delay`) SELECT m.`new`, r.`new`, o.`position`, o.`name`, s.`new`, o.`fade`, o.`trigger`, o.`delay` FROM `cues_old` o JOIN `_cue_ids` m ON m.`old` = o.`id` JOIN `_room_ids` r ON r.`old` = o.`room_id` JOIN `_scene_ids` s ON s.`old` = o.`scene_id`;--> statement-breakpoint
DROP TABLE `cues_old`;--> statement-breakpoint
DROP TABLE `target_positions_old`;--> statement-breakpoint
DROP TABLE `scenes_old`;--> statement-breakpoint
DROP TABLE `effects_old`;--> statement-breakpoint
DROP TABLE `targets_old`;--> statement-breakpoint
DROP TABLE `fixtures_old`;--> statement-breakpoint
DROP TABLE `rooms_old`;--> statement-breakpoint
DROP TABLE `_room_ids`;--> statement-breakpoint
DROP TABLE `_fixture_ids`;--> statement-breakpoint
DROP TABLE `_effect_ids`;--> statement-breakpoint
DROP TABLE `_scene_ids`;--> statement-breakpoint
DROP TABLE `_cue_ids`;
