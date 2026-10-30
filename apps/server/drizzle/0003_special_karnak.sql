CREATE TABLE `target_positions` (
	`target_id` integer NOT NULL,
	`fixture_id` integer NOT NULL,
	`pan` integer NOT NULL,
	`tilt` integer NOT NULL,
	PRIMARY KEY(`target_id`, `fixture_id`),
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `calibration_points`;--> statement-breakpoint
DROP TABLE `target_nudges`;--> statement-breakpoint
ALTER TABLE `targets` DROP COLUMN `x`;--> statement-breakpoint
ALTER TABLE `targets` DROP COLUMN `y`;--> statement-breakpoint
ALTER TABLE `targets` DROP COLUMN `height`;