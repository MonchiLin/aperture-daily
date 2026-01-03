import dayjs from 'dayjs';

/**
 * 日历业务逻辑 - 将原始数据转换为视图模型
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
 * 生成日历网格数据（42天 = 6周）
 * 固定从周一开始
 */
function generateCalendarDateStrings(monthStart: dayjs.Dayjs): string[] {
    const days: string[] = [];

    // 找到第一周的周一
    // dayjs().day(): 0 (Sunday) to 6 (Saturday)
    const dayOfWeek = monthStart.day();
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // 回退到该周的周一
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
    const selected = dayjs(selectedDate);
    const monthStart = selected.startOf('month');

    const currentYear = monthStart.year();
    const currentMonth = monthStart.month();
    const monthName = monthStart.locale('en').format('MMMM');

    const prevMonthStr = monthStart.subtract(1, 'month').format('YYYY-MM-DD');
    const nextMonthStr = monthStart.add(1, 'month').format('YYYY-MM-DD');
    const todayStr = dayjs().format('YYYY-MM-DD');

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
