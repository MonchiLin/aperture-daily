import { dayjs } from '@server/lib/time';

/**
 * Calendar Logic (日历核心算法)
 * 
 * 核心目标：
 * 将线性的时间流转换为二维的月视图网格。
 * 
 * 算法约束：
 * 1. 标准 6 行视图：为了保持 UI 高度一致，无论当月有多少天，始终生成 42 (6x7) 个格子的数据。
 * 2. ISO 周起始：强制从周一开始 (Monday Start)，符合中国/欧洲习惯。
 * 3. 跨月填充：自动填补上个月末尾和下个月开头的日期。
 */

export interface CalendarDay {
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isPublished: boolean;
    isSelected: boolean;
}

export interface CalendarState {
    days: CalendarDay[];
    currentYear: number;
    monthName: string;
    prevMonthStr: string;
    nextMonthStr: string;
    todayStr: string;
}

/**
 * 生成标准的 42 格日历日期数组
 * 
 * 算法详解：
 * 1. 锚定本月 1 号。
 * 2. 计算 1 号是周几 (Sunday=0, Monday=1...)。
 * 3. 计算 offset：我们需要回退几天才能到达上一个“周一”？
 *    - 如果 1 号是周一 (1)，回退 0 天。
 *    - 如果 1 号是周日 (0)，回退 6 天。
 * 4. 从 StartDate 开始，连续生成 42 天。
 */
function generateCalendarDateStrings(monthStart: dayjs.Dayjs): string[] {
    const days: string[] = [];

    // dayjs().day(): 0 (周日) 到 6 (周六)
    const dayOfWeek = monthStart.day();
    // 核心偏移公式：(dayOfWeek + 6) % 7 也能实现，但下面的写法更直观：
    // 如果是周日(0)，则 offset=6；否则 offset = day - 1。
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // 回退到本周一
    const startDate = monthStart.subtract(offset, 'day');

    for (let i = 0; i < 42; i++) {
        days.push(startDate.add(i, 'day').format('YYYY-MM-DD'));
    }

    return days;
}

/**
 * 获取完整的日历状态视图模型
 */
export function getCalendarState(selectedDate: string, publishedDays: string[]): CalendarState {
    const selected = dayjs.tz(selectedDate);
    const monthStart = selected.startOf('month');

    const currentYear = monthStart.year();
    const currentMonth = monthStart.month();
    const monthName = monthStart.locale('en').format('MMMM');

    const prevMonthStr = monthStart.subtract(1, 'month').format('YYYY-MM-DD');
    const nextMonthStr = monthStart.add(1, 'month').format('YYYY-MM-DD');
    const todayStr = dayjs().tz().format('YYYY-MM-DD');

    const dateStrings = generateCalendarDateStrings(monthStart);

    const days: CalendarDay[] = dateStrings.map(dateStr => {
        const d = dayjs(dateStr);
        return {
            dateStr,
            dayNumber: d.date(),
            isCurrentMonth: d.month() === currentMonth && d.year() === currentYear,
            isToday: dateStr === todayStr,
            isPublished: publishedDays.includes(dateStr),
            isSelected: dateStr === selectedDate
        };
    });

    return {
        days,
        currentYear,
        monthName,
        prevMonthStr,
        nextMonthStr,
        todayStr
    };
}
