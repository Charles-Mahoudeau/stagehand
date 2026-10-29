CREATE TABLE `fixtures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`address` integer NOT NULL,
	`x` real,
	`y` real,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixtures_room_name_unique` ON `fixtures` (`room_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `fixtures_room_address` ON `fixtures` (`room_id`,`address`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_unique` ON `rooms` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_single_active` ON `rooms` (`active`) WHERE "rooms"."active" = 1;