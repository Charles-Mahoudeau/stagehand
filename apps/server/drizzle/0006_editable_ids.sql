-- Foreign keys gain ON UPDATE CASCADE so that an ID can be edited.
DROP INDEX `rooms_name_unique`;
--> statement-breakpoint
DROP INDEX `rooms_single_active`;
--> statement-breakpoint
DROP INDEX `fixtures_room_name_unique`;
--> statement-breakpoint
DROP INDEX `fixtures_room_address`;
--> statement-breakpoint
DROP INDEX `effects_room_name_unique`;
--> statement-breakpoint
DROP INDEX `scenes_room_name_unique`;
--> statement-breakpoint
DROP INDEX `cues_room_position`;
--> statement-breakpoint
ALTER TABLE `rooms` RENAME TO `rooms_old`;
--> statement-breakpoint
ALTER TABLE `fixtures` RENAME TO `fixtures_old`;
--> statement-breakpoint
ALTER TABLE `targets` RENAME TO `targets_old`;
--> statement-breakpoint
ALTER TABLE `target_positions` RENAME TO `target_positions_old`;
--> statement-breakpoint
ALTER TABLE `effects` RENAME TO `effects_old`;
--> statement-breakpoint
ALTER TABLE `scenes` RENAME TO `scenes_old`;
--> statement-breakpoint
ALTER TABLE `cues` RENAME TO `cues_old`;
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`width` real,
	`depth` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` (lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_single_active` ON `rooms` (`active`) WHERE "rooms"."active" = 1;
--> statement-breakpoint
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
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixtures_room_name_unique` ON `fixtures` (`room_id`,lower("name"));
--> statement-breakpoint
CREATE INDEX `fixtures_room_address` ON `fixtures` (`room_id`,`address`);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE cascade ON DELETE cascade
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
	FOREIGN KEY (`room_id`,`fixture_id`) REFERENCES `fixtures`(`room_id`,`id`) ON UPDATE cascade ON DELETE cascade
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
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `effects_room_name_unique` ON `effects` (`room_id`,lower("name"));
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`look` text NOT NULL,
	`effects` text NOT NULL,
	`fade` real DEFAULT 2 NOT NULL,
	PRIMARY KEY(`room_id`, `id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_room_name_unique` ON `scenes` (`room_id`,lower("name"));
--> statement-breakpoint
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
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`room_id`,`scene_id`) REFERENCES `scenes`(`room_id`,`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cues_room_position` ON `cues` (`room_id`,`position`);
--> statement-breakpoint
INSERT INTO `rooms` SELECT * FROM `rooms_old`;
--> statement-breakpoint
INSERT INTO `fixtures` SELECT * FROM `fixtures_old`;
--> statement-breakpoint
INSERT INTO `targets` SELECT * FROM `targets_old`;
--> statement-breakpoint
INSERT INTO `target_positions` SELECT * FROM `target_positions_old`;
--> statement-breakpoint
INSERT INTO `effects` SELECT * FROM `effects_old`;
--> statement-breakpoint
INSERT INTO `scenes` SELECT * FROM `scenes_old`;
--> statement-breakpoint
INSERT INTO `cues` SELECT * FROM `cues_old`;
--> statement-breakpoint
DROP TABLE `cues_old`;
--> statement-breakpoint
DROP TABLE `scenes_old`;
--> statement-breakpoint
DROP TABLE `effects_old`;
--> statement-breakpoint
DROP TABLE `target_positions_old`;
--> statement-breakpoint
DROP TABLE `targets_old`;
--> statement-breakpoint
DROP TABLE `fixtures_old`;
--> statement-breakpoint
DROP TABLE `rooms_old`;
