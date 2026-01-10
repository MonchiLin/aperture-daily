/**
 * 每日单词抓取与存储模块
 *
 * 核心职责：从扇贝获取当日学习词汇，存储到本地数据库
 *
 * 业务流程：
 *   1. 调用扇贝 API 获取今日新词和复习词
 *   2. 插入/更新 words 表（全局词库）
 *   3. 创建 daily_word_references（日期-词汇关联）
 *
 * 设计约束：
 * - D1 数据库参数绑定上限约 100，需要分块插入
 * - 插入间隔 100ms，避免触发扇贝 API 限流
 * - 同一日期重复抓取会先清理再插入（幂等性）
 */

import type { AppKysely } from '../db/factory';
import { fetchShanbayTodayWords } from './shanbay';

/** 字符串数组去重，过滤空值 */
function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 抓取并存储每日词汇
 *
 * @param taskDate - 目标日期（格式：YYYY-MM-DD）
 * @param shanbayCookie - 扇贝登录 Cookie（敏感信息，从环境变量获取）
 *
 * @throws 无词汇时抛出错误，阻止后续生成任务
 */
export async function fetchAndStoreDailyWords(
    db: AppKysely,
    args: {
        taskDate: string;
        shanbayCookie: string;
    }
) {
    const shanbay = await fetchShanbayTodayWords(args.shanbayCookie);
    if (!Array.isArray(shanbay.newWords) || !Array.isArray(shanbay.reviewWords)) {
        throw new Error('Shanbay: invalid word payload');
    }

    const newWords = uniqueStrings(shanbay.newWords);
    const reviewWords = uniqueStrings(shanbay.reviewWords);

    // 业务约束：必须有词汇才能生成文章
    // 如果用户当天未学习或已完成所有任务，应阻止后续流程
    if (newWords.length + reviewWords.length === 0) {
        throw new Error('No words found from Shanbay.');
    }

    const allWords = [...new Set([...newWords, ...reviewWords])];

    // ─────────────────────────────────────────────────────────────
    // 分块插入词库（words 表）
    //
    // 为什么分块？
    // - D1 单次查询参数绑定上限约 100
    // - 10 * columns ≈ 50 条记录较安全
    // ─────────────────────────────────────────────────────────────
    const WORD_INSERT_CHUNK_SIZE = 50;

    for (let i = 0; i < allWords.length; i += WORD_INSERT_CHUNK_SIZE) {
        const chunk = allWords.slice(i, i + WORD_INSERT_CHUNK_SIZE);
        console.log(`[DailyWords] Inserting words chunk: ${i} - ${i + chunk.length} / ${allWords.length}`);

        await db.insertInto('words')
            .values(chunk.map((w) => ({ word: w, origin: 'shanbay' })))
            .onConflict((oc) => oc.doNothing())  // 词汇已存在时跳过
            .execute();

        await sleep(100);  // 避免触发限流
    }

    // ─────────────────────────────────────────────────────────────
    // 重建日期-词汇引用（幂等操作）
    //
    // 先删除该日期的旧引用，再插入新引用
    // 确保重复抓取不会产生重复数据
    // ─────────────────────────────────────────────────────────────
    await db.deleteFrom('daily_word_references')
        .where('date', '=', args.taskDate)
        .execute();

    const references = [
        ...newWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'new' as const })),
        ...reviewWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'review' as const }))
    ];

    // 分块插入引用（5 列 * 20 条 = 100 参数）
    const REF_CHUNK = 20;
    for (let i = 0; i < references.length; i += REF_CHUNK) {
        console.log(`[DailyWords] Inserting references chunk: ${i} - ${Math.min(i + REF_CHUNK, references.length)} / ${references.length}`);

        await db.insertInto('daily_word_references')
            .values(references.slice(i, i + REF_CHUNK))
            .onConflict((oc) => oc.doNothing())
            .execute();

        await sleep(100);
    }

    return {
        taskDate: args.taskDate,
        newCount: newWords.length,
        reviewCount: reviewWords.length
    };
}

