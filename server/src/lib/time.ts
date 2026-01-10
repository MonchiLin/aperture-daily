import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 注册插件
dayjs.extend(utc);
dayjs.extend(timezone);

// 全局时区锚点 (Timezone Anchor)
// 我们的逻辑全部基于 'Asia/Shanghai'。
// 即使部署在 UTC 的 Docker 容器中，所有业务逻辑（“今天的新闻”）都必须以北京时间为准。
dayjs.tz.setDefault('Asia/Shanghai');

export const BUSINESS_TIMEZONE = 'Asia/Shanghai';

/**
 * 获取“业务日期” (Business Date) YYYY-MM-DD
 * 
 * 核心概念：
 * - 物理时间: 2023-10-01T02:00:00Z (UTC)
 * - 业务视角: 在北京时间 (UTC+8) 下，这是 2023-10-01 上午 10 点。
 * 
 * 此函数强制将任何 Date 对象先转换到 Asia/Shanghai 时区，再提取日期部分。
 * 确保无论服务器运行在哪个时区，"今天"永远是北京时间的今天。
 */
export function getBusinessDate(date: Date | string = new Date()) {
    return dayjs(date).tz(BUSINESS_TIMEZONE).format('YYYY-MM-DD');
}

/**
 * 获取“今天”的业务日期字符串
 */
export function getTodayStr() {
    return dayjs().tz(BUSINESS_TIMEZONE).format('YYYY-MM-DD');
}

/**
 * 格式化时间为 HH:mm
 */
export function formatTime(iso: string | null | undefined): string {
    if (!iso) return '-';
    try {
        return dayjs(iso).tz().format('HH:mm');
    } catch {
        return iso;
    }
}

export { dayjs };

