const BASE = 'https://apiv3.shanbay.com';

import { decodeShanbayData } from '../lib/shanbayDecode.js';

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

async function getWordsInPage(cookie: string, page: number, materialbookId: string, typeOf: 'NEW' | 'REVIEW') {
    const url = `${BASE}/wordsapp/user_material_books/${materialbookId}/learning/words/today_learning_items?ipp=10&page=${page}&type_of=${typeOf}`;
    const json = (await fetchJson(url, cookie)) as { data?: string | null };
    if (!json || !json.data) throw new Error(`Shanbay: missing data payload (${typeOf} page ${page})`);
    return decodeShanbayData(json.data);
}

interface DecodedData {
    objects?: unknown[];
}

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

function toWordList(items: unknown[]) {
    return (items as WordItem[])
        .map((x) => x?.vocab_with_senses?.word)
        .filter((w): w is string => typeof w === 'string' && w.length > 0);
}

export type ShanbayTodayWords = {
    materialbookId: string;
    newWords: string[];
    reviewWords: string[];
};


async function initDailyCheckin(cookie: string, materialbookId: string) {
    const url = `${BASE}/wordsapp/user_material_books/${materialbookId}/learning/statuses`;
    // 触发初始化，就像网页端加载一样
    await fetchJson(url, cookie);
}

// 需要有效登录 Cookie；调用方应按密钥处理，失败直接抛错。
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
        // [自动修复策略] "Lazy Initialization"
        // 扇贝 API 有一个怪癖：新的一天开始时，如果用户没有在 App/Web 端访问过，
        // 后端数据可能未生成，直接调用 获取单词接口 会返回 412 Precondition Failed。
        // 
        // 解决方案：捕获 412，显式调用 checkin 接口触发后端生成数据，然后重试。
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
