CREATE TABLE `calibration_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fixture_id` integer NOT NULL,
	`name` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`pan` integer,
	`tilt` integer,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calibration_points_fixture` ON `calibration_points` (`fixture_id`);--> statement-breakpoint
CREATE TABLE `target_nudges` (
	`target_id` integer NOT NULL,
	`fixture_id` integer NOT NULL,
	`pan` real DEFAULT 0 NOT NULL,
	`tilt` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`target_id`, `fixture_id`),
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`height` real,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `targets_room_slug_unique` ON `targets` (`room_id`,`slug`);