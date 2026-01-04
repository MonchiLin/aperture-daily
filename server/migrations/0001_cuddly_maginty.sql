PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_article_word_index` (
	`id` text PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`article_id` text NOT NULL,
	`context_snippet` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_awi_role_enum" CHECK("__new_article_word_index"."role" IN ('keyword', 'entity'))
);
--> statement-breakpoint
INSERT INTO `__new_article_word_index`("id", "word", "article_id", "context_snippet", "role", "created_at") SELECT "id", "word", "article_id", "context_snippet", "role", "created_at" FROM `article_word_index`;--> statement-breakpoint
DROP TABLE `article_word_index`;--> statement-breakpoint
ALTER TABLE `__new_article_word_index` RENAME TO `article_word_index`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_awi_word` ON `article_word_index` (`word`);--> statement-breakpoint
CREATE INDEX `idx_awi_article_id` ON `article_word_index` (`article_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_awi_word_article` ON `article_word_index` (`word`,`article_id`);--> statement-breakpoint
CREATE TABLE `__new_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_task_id` text NOT NULL,
	`model` text NOT NULL,
	`variant` integer NOT NULL,
	`title` text NOT NULL,
	`content_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`generation_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_articles_status_enum" CHECK("__new_articles"."status" IN ('draft', 'published')),
	CONSTRAINT "chk_articles_content_json_valid" CHECK(json_valid("__new_articles"."content_json"))
);
--> statement-breakpoint
INSERT INTO `__new_articles`("id", "generation_task_id", "model", "variant", "title", "content_json", "status", "created_at", "published_at") SELECT "id", "generation_task_id", "model", "variant", "title", "content_json", "status", "created_at", "published_at" FROM `articles`;--> statement-breakpoint
DROP TABLE `articles`;--> statement-breakpoint
ALTER TABLE `__new_articles` RENAME TO `articles`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_articles_unique` ON `articles` (`generation_task_id`,`model`);--> statement-breakpoint
CREATE INDEX `idx_articles_generation_task_id` ON `articles` (`generation_task_id`);--> statement-breakpoint
CREATE INDEX `idx_articles_status` ON `articles` (`status`);--> statement-breakpoint
CREATE INDEX `idx_articles_published` ON `articles` (`published_at`);--> statement-breakpoint
CREATE TABLE `__new_highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`actor` text NOT NULL,
	`start_meta_json` text NOT NULL,
	`end_meta_json` text NOT NULL,
	`text` text NOT NULL,
	`note` text,
	`style_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_highlights_start_meta_json_valid" CHECK(json_valid("__new_highlights"."start_meta_json")),
	CONSTRAINT "chk_highlights_end_meta_json_valid" CHECK(json_valid("__new_highlights"."end_meta_json")),
	CONSTRAINT "chk_highlights_style_json_valid" CHECK("__new_highlights"."style_json" IS NULL OR json_valid("__new_highlights"."style_json"))
);
--> statement-breakpoint
INSERT INTO `__new_highlights`("id", "article_id", "actor", "start_meta_json", "end_meta_json", "text", "note", "style_json", "created_at", "updated_at", "deleted_at") SELECT "id", "article_id", "actor", "start_meta_json", "end_meta_json", "text", "note", "style_json", "created_at", "updated_at", "deleted_at" FROM `highlights`;--> statement-breakpoint
DROP TABLE `highlights`;--> statement-breakpoint
ALTER TABLE `__new_highlights` RENAME TO `highlights`;--> statement-breakpoint
CREATE INDEX `idx_highlights_article_id` ON `highlights` (`article_id`);--> statement-breakpoint
CREATE INDEX `idx_highlights_actor` ON `highlights` (`actor`);--> statement-breakpoint
CREATE INDEX `idx_highlights_article_actor` ON `highlights` (`article_id`,`actor`);