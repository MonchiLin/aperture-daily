import React, { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

type CalendarProps = {
    className?: string;
    publishedDays?: string[]; // ISO 8601 字符串（YYYY-MM-DD）
    dayHrefBase?: string;
    selectedDate?: string | null;
    onSelectDate?: (date: string) => void;
};

export const MacOSCalendar: React.FC<CalendarProps> = ({ className, publishedDays = [], dayHrefBase, selectedDate, onSelectDate }) => {
    // 初始化为今天所在的月份 (本地时间)
    const [currentMonth, setCurrentMonth] = useState(() => {
        return dayjs(selectedDate || undefined).startOf('month');
    });

    // 导航
    const nextMonth = () => setCurrentMonth(currentMonth.add(1, 'month'));
    const prevMonth = () => setCurrentMonth(currentMonth.subtract(1, 'month'));
    const goToday = () => {
        const t = dayjs();
        setCurrentMonth(t.startOf('month'));
        if (onSelectDate) onSelectDate(t.format('YYYY-MM-DD'));
    }

    // 生成日期
    const days = useMemo(() => {
        const startOfMonth = currentMonth;
        // Mon=1, Sun=7
        let dayOfWeek: number = startOfMonth.day();
        if (dayOfWeek === 0) dayOfWeek = 7;

        // 算出日历网格开始的日期：当前月1号 减去 (dayOfWeek - 1) 天
        const startDate = startOfMonth.subtract(dayOfWeek - 1, 'day');

        const dayList: Dayjs[] = [];
        let iter = startDate;
        for (let i = 0; i < 42; i++) {
            dayList.push(iter);
            iter = iter.add(1, 'day');
        }
        return dayList;
    }, [currentMonth]);

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className={`flex flex-col w-full font-serif text-slate-900 ${className}`}>
            {/* 头部 - 极简 */}
            <header className="flex items-center justify-between py-4 mb-2">
                <div className="flex flex-col">
                    <span className="text-sm font-bold tracking-widest uppercase text-stone-500 mb-1">
                        {currentMonth.year()}
                    </span>
                    <h2 className="text-4xl font-black tracking-tight font-serif text-slate-900/90 leading-none">
                        {currentMonth.format('MMMM')}
                    </h2>
                </div>

                <div className="flex items-center gap-1">
                    <div className="flex items-center border border-stone-200 rounded-sm">
                        <button onClick={prevMonth} className="p-1 hover:bg-stone-100 transition-colors" aria-label="Previous Month">
                            <ChevronLeftIcon />
                        </button>
                        <div className="w-px h-4 bg-stone-200"></div>
                        <button onClick={nextMonth} className="p-1 hover:bg-stone-100 transition-colors" aria-label="Next Month">
                            <ChevronRightIcon />
                        </button>
                    </div>
                    <button
                        onClick={goToday}
                        className="ml-2 px-3 py-1 text-xs font-bold uppercase tracking-widest border border-stone-200 hover:bg-stone-100 transition-colors rounded-sm"
                    >
                        Today
                    </button>
                </div>
            </header>

            {/* 星期表头 - 更粗的线条 */}
            <div className="grid grid-cols-7 py-2 border-y-2 border-slate-900 mb-2">
                {weekDays.map(day => (
                    <div key={day} className="text-center text-xs font-bold uppercase tracking-widest text-slate-900">{day}</div>
                ))}
            </div>

            {/* 日期网格 - 干净的平铺 */}
            <div className="grid grid-cols-7 gap-y-4 gap-x-1">
                {days.map(date => {
                    const dateStr = date.format('YYYY-MM-DD');
                    const isCurrentMonth = date.month() === currentMonth.month();
                    // dayjs comparisons
                    const isToday = date.isSame(dayjs(), 'day');
                    const isPublished = publishedDays.includes(dateStr);
                    const isSelected = selectedDate === dateStr;

                    // 选中态：实心圆 (Deep Oxford Blue)
                    // 今天：空心圆
                    // 有文章：下方小点
                    const dayClassName = `
                        relative group flex flex-col items-center justify-center h-10 w-10 mx-auto transition-all cursor-pointer rounded-full
                        ${!isCurrentMonth ? 'opacity-20' : 'opacity-100'}
                        ${isSelected ? 'bg-slate-900 text-[#F3F2EE]' : 'hover:bg-stone-200'}
                        ${isToday && !isSelected ? 'ring-2 ring-slate-400' : ''}
                    `;

                    const content = (
                        <>
                            <span className={`text-base font-serif font-medium ${isSelected ? 'font-bold' : ''}`}>
                                {date.date()}
                            </span>

                            {/* 事件指示 - 极简点 */}
                            {isPublished && !isSelected && (
                                <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-red-800" />
                            )}
                        </>
                    );

                    if (onSelectDate) {
                        return (
                            <div
                                key={dateStr}
                                onClick={() => onSelectDate(dateStr)}
                                className={dayClassName}
                                role="button"
                                tabIndex={0}
                            >
                                {content}
                            </div>
                        )
                    }

                    // Fallback href behavior
                    const href = dayHrefBase ? `${dayHrefBase}/${dateStr}` : undefined;
                    if (href) {
                        return (
                            <a
                                key={dateStr}
                                href={href}
                                className={dayClassName}
                            >
                                {content}
                            </a>
                        );
                    }

                    return (
                        <div key={dateStr} className={dayClassName}>
                            {content}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function ChevronLeftIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
        </svg>
    )
}

function ChevronRightIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
    )
}
