import type { APIRoute } from 'astro';
import { z } from 'zod';
import { requireAdmin } from '../../../../lib/admin';
import { getDb } from '../../../../lib/db';
import { badRequest, json } from '../../../../lib/http';
import { getBusinessDate } from '../../../../lib/time';
import { runArticleGenerationTask } from '../../../../lib/tasks/articleGeneration';
import { enqueueGenerationTasks, startNextQueuedIfIdle } from '../../../../lib/tasks/generationQueue';

const bodySchema = z.object({
	task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const POST: APIRoute = async ({ request, locals }) => {
	const denied = requireAdmin(request, locals);
	if (denied) return denied;

	try {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			body = {};
		}

		const parsed = bodySchema.safeParse(body);
		if (!parsed.success) return badRequest('Invalid request body', parsed.error.flatten());

		const db = getDb(locals);
		const taskDate = parsed.data.task_date ?? getBusinessDate();
		const created = await enqueueGenerationTasks(db, taskDate);

		await startNextQueuedIfIdle(db, taskDate, (taskId) => {
			locals.runtime.ctx.waitUntil(runArticleGenerationTask(locals, taskId));
		});

		return json({ ok: true, task_date: taskDate, tasks: created }, { status: 201 });
	} catch (err) {
		console.error('POST /api/admin/tasks/generate failed', err);
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('No daily words found') || message.includes('No generation profile found')) {
			return badRequest(message);
		}
		return json({ ok: false, error: 'internal_error', message }, { status: 500 });
	}
};
