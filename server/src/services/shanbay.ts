/**
 * 扇贝 API 集成模块
 *
 * 核心职责：从扇贝获取用户当日学习词汇（新词 + 复习词）
 *
 * API 特性与风险：
 * - 需要有效的登录 Cookie（含 session 和 token）
 * - Cookie 有效期约 7-30 天，过期需重新获取
 * - 高频请求可能触发风控，导致 Cookie 失效
 *
 * 数据格式：
 * - 响应 data 字段经过加密，需调用 decodeShanbayData 解密
 * - 解密后为标准 JSON 格式
 *
 * 已知陷阱：
 * - 每日首次请求可能返回 412（数据未初始化）
 * - 解决方案：捕获 412 后调用 checkin 接口触发数据生成，再重试
 */

const BASE = 'https://apiv3.shanbay.com';

import { decodeShanbayData } from '../lib/shanbayDecode.js';

// ════════════════════════════════════════════════════════════════
// 通用请求封装
// ════════════════════════════════════════════════════════════════

/**
 * 带认证的 JSON 请求
 *
 * 伪造浏览器 User-Agent 以绕过基础风控
 */
async function fetchJson(url: string, cookie: string) {
    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            accept: 'application/json',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            cookie
        }
    });

    if (!resp.ok) {
        let text = '';
        try {
            text = await resp.text();
        } catch (err) {
            throw new Error(
                `Shanbay HTTP ${resp.status} ${resp.statusText}: ${url}\nFailed to read body: ${String(err)}`
            );
        }
        throw new Error(`Shanbay HTTP ${resp.status} ${resp.statusText}: ${url}\n${text}`);
    }

    return resp.json() as Promise<unknown>;
}

// ════════════════════════════════════════════════════════════════
// 词书与词汇获取
// ════════════════════════════════════════════════════════════════

/** 获取用户当前词书 ID */
async function getMaterialbookId(cookie: string) {
    const json = (await fetchJson(`${BASE}/wordsapp/user_material_books/current`, cookie)) as {
        materialbook_id?: string | number;
        materialbook?: { id?: string | number } | null;
    };

    if (typeof json.materialbook_id !== 'string' && typeof json.materialbook_id !== 'number') {
        throw new Error('Shanbay: missing materialbook_id');
    }
    return String(json.materialbook_id);
}

/**
 * 获取单页词汇列表
 *
 * @param typeOf - 'NEW' 新词 | 'REVIEW' 复习词
 */
async function getWordsInPage(cookie: string, page: number, materialbookId: string, typeOf: 'NEW' | 'REVIEW') {
    const url = `${BASE}/wordsapp/user_material_books/${materialbookId}/learning/words/today_learning_items?ipp=10&page=${page}&type_of=${typeOf}`;
    const json = (await fetchJson(url, cookie)) as { data?: string | null };

    if (!json || !json.data) {
        throw new Error(`Shanbay: missing data payload (${typeOf} page ${page})`);
    }

    // data 字段是加密的，需要解密
    return decodeShanbayData(json.data);
}

interface DecodedData {
    objects?: unknown[];
}

/**
 * 获取全部词汇（自动分页）
 *
 * 循环请求直到返回空数组
 */
async function getWordsAll(cookie: string, materialbookId: string, typeOf: 'NEW' | 'REVIEW') {
    const out: unknown[] = [];

    for (let page = 1; ; page++) {
        const decoded = await getWordsInPage(cookie, page, materialbookId, typeOf);
        const objects = (decoded as DecodedData)?.objects;

        if (!Array.isArray(objects)) {
            throw new Error(`Shanbay: unexpected payload shape (${typeOf} page ${page})`);
        }

        if (objects.length === 0) break;
        out.push(...objects);
    }

    return out;
}

interface WordItem {
    vocab_with_senses?: { word?: string };
}

/** 从 API 响应中提取词汇字符串列表 */
function toWordList(items: unknown[]) {
    return (items as WordItem[])
        .map((x) => x?.vocab_with_senses?.word)
        .filter((w): w is string => typeof w === 'string' && w.length > 0);
}

// ════════════════════════════════════════════════════════════════
// 导出接口
// ════════════════════════════════════════════════════════════════

export type ShanbayTodayWords = {
    materialbookId: string;
    newWords: string[];
    reviewWords: string[];
};

/**
 * 触发每日数据初始化
 *
 * 扇贝 API 怪癖：新的一天开始时，如果用户未在 App/Web 访问过，
 * 后端数据可能未生成。此函数模拟用户访问，触发数据生成。
 */
async function initDailyCheckin(cookie: string, materialbookId: string) {
    const url = `${BASE}/wordsapp/user_material_books/${materialbookId}/learning/statuses`;
    await fetchJson(url, cookie);
}

/**
 * 获取用户当日学习词汇
 *
 * @param cookie - 扇贝登录 Cookie（敏感信息，调用方负责安全存储）
 * @returns 新词列表和复习词列表
 *
 * @throws Cookie 无效或过期时抛出错误
 *
 * 自动修复策略：
 * - 412 错误 → 调用 initDailyCheckin 触发数据生成 → 重试
 */
export async function fetchShanbayTodayWords(cookie: string): Promise<ShanbayTodayWords> {
    const materialbookId = await getMaterialbookId(cookie);

    try {
        const [newItems, reviewItems] = await Promise.all([
            getWordsAll(cookie, materialbookId, 'NEW'),
            getWordsAll(cookie, materialbookId, 'REVIEW')
        ]);

        return {
            materialbookId,
            newWords: toWordList(newItems),
            reviewWords: toWordList(reviewItems)
        };
    } catch (err: unknown) {
        const msg = String(err);

        // 自动修复：412 数据未初始化
        if (msg.includes('412') && (msg.includes('初始化') || msg.includes('initializ'))) {
            console.log(`[Shanbay] 412 Error detected (Data Not Initialized). Triggering initDailyCheckin for ${materialbookId}...`);
            await initDailyCheckin(cookie, materialbookId);

            console.log(`[Shanbay] Initialization done. Retrying fetch...`);
            const [newItems, reviewItems] = await Promise.all([
                getWordsAll(cookie, materialbookId, 'NEW'),
                getWordsAll(cookie, materialbookId, 'REVIEW')
            ]);

            return {
                materialbookId,
                newWords: toWordList(newItems),
                reviewWords: toWordList(reviewItems)
            };
        }

        throw err;
    }
}

