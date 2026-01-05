import { Database } from 'bun:sqlite';
const db = new Database('local.db');

const articleId = 'eddc8874-1f7e-4559-ae39-f3d6dd01b004';

// 1. Get generation_task_id
const article = db.query("SELECT generation_task_id FROM articles WHERE id = ?").get(articleId) as any;

if (!article) {
    console.error("Article not found");
    process.exit(1);
}

const taskId = article.generation_task_id;
console.log(`Task ID: ${taskId}`);

// 2. data from task
const task = db.query("SELECT result_json FROM tasks WHERE id = ?").get(taskId) as any;

if (!task || !task.result_json) {
    console.error("Task or result_json not found");
} else {
    // 3. Inspect JSON structure
    try {
        const result = JSON.parse(task.result_json);
        // Usually result_json has { generated: ... } or might be the checkpoint.
        // TaskQueue.ts saves `resultData` which has `selected_words`. 
        // Wait, TaskQueue saves `result_json` = `resultData`.
        // `resultData` does NOT contain the full content! It contains `generated: { model, article_id }`.

        console.log("Task Result Keys:", Object.keys(result));

        // CHECKPOINT?
        // Maybe the task has intermediate checkpoints? No, final update overwrites it.

        // WAIT. TaskQueue also saves `tasks.resultJson`... but line 475 in TaskQueue.ts says:
        /*
            result_json = ${JSON.stringify(resultData)}, 
        */
        // And `resultData` (line 375) is:
        /*
        const resultData = {
            new_count: ...,
            ...
            generated: { model, article_id: articleId },
            ...
        };
        */
        // IT DOES NOT CONTAIN THE CONTENT.

        // IMPLICATION: The `content_json` column in `articles` was the ONLY place storing the full content (including structure).
        // If I dropped `content_json` without migrating `structure`, it is GONE unless I have a backup ... or if I can re-parse it from somewhere else.

        // CHECK: Did I accidentally delete `tasks.result_json` content? 
        // In `TaskQueue.ts`, I see `result_json` being updated with `resultData` on completion.

        // HOWEVER, maybe the CP (Checkpoint) data is still useful?
        // If the task finished, the checkpoint is overwritten by the final result summary.

        // OH NO. 
        // Let's hope `article_variants` has a `structure` column? checking schema.ts...
        // I checked schema.ts before restoring it. It did NOT have `structure`.

        // Is there any other backup?
        // I normalized: `title`, `content` (markdown).
        // The `structure` is a JSON object usually attached to the variant.

        // Let's verify if `article_variants` happened to catch it? 
        // No, Drizzle insert matches columns.

        // Is there any way `migrate-articles.ts` saved it?
        // In `migrate-articles.ts` (which I deleted but recall):
        // I mapped `level`, `levelLabel`, `title`, `content`.
        // I did NOT map `structure`.

        // CONCLUSION: The `structure` data was dropped for existing articles.

        // RECOVERY OPTIONS:
        // 1. Re-generate structure? (Run the "Analysis" step again?)
        // 2. Is there a backup of `local.db`? 
        //    - I see `backup.sql` or similar? 
        //    - `server/scripts/backup-db.ts` exists. Did I run it?
        //    - `drizzle` might have created a backup? No.

        // Let's check for `backup.db` or similar files.

    } catch (e) {
        console.error("Error parsing JSON", e);
    }
}
