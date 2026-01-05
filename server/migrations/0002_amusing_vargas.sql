CREATE TABLE `daily_word_references` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`word` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`date`) REFERENCES `daily_words`(`date`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word`) REFERENCES `words`(`word`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_daily_word_ref_type_enum" CHECK("daily_word_references"."type" IN ('new', 'review'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_word_ref` ON `daily_word_references` (`date`,`word`);--> statement-breakpoint
CREATE INDEX `idx_daily_word_ref_date` ON `daily_word_references` (`date`);--> statement-breakpoint
CREATE INDEX `idx_daily_word_ref_word` ON `daily_word_references` (`word`);--> statement-breakpoint
ALTER TABLE `articles` ADD `read_levels` integer DEFAULT 0 NOT NULL;