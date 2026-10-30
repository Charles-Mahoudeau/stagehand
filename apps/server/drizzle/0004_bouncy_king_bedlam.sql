CREATE TABLE `cues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`scene_id` integer NOT NULL,
	`fade` real,
	`trigger` text DEFAULT 'go' NOT NULL,
	`delay` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cues_room_position` ON `cues` (`room_id`,`position`);--> statement-breakpoint
CREATE TABLE `effects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`generator` text NOT NULL,
	`params` text NOT NULL,
	`pad` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `effects_room_name_unique` ON `effects` (`room_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`look` text NOT NULL,
	`effects` text NOT NULL,
	`fade` real DEFAULT 2 NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenes_room_name_unique` ON `scenes` (`room_id`,lower("name"));