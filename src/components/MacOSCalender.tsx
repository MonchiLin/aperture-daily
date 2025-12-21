import React, { useMemo, useState } from 'react';
import 'temporal-polyfill/global';

type CalendarProps = {
    className?: string;
    publishedDays?: string[]; // ISO 8601 字符串（YYYY-MM-DD）
    dayHrefBase?: string;
    selectedDate?: string | null;
    onSelectDate?: (date: string) => void;
};

export const MacOSCalendar: React.FC<CalendarProps> = ({ className, publishedDays = [], dayHrefBase, selectedDate, onSelectDate }) => {
    // 初始化为今天
    const today = Temporal.Now.plainDateISO();
    const [currentMonth, setCurrentMonth] = useState(today.with({ day: 1 }));

    // 导航
    const nextMonth = () => setCurrentMonth(currentMonth.add({ months: 1 }));
    const prevMonth = () => setCurrentMonth(currentMonth.subtract({ months: 1 }));
    const goToday = () => {
        const t = Temporal.Now.plainDateISO();
        setCurrentMonth(t.with({ day: 1 }));
        if (onSelectDate) onSelectDate(t.toString());
    }

    // 生成日期
    const days = useMemo(() => {
        const startDate = currentMonth.subtract({ days: currentMonth.dayOfWeek - 1 });

        const dayList = [];
        let iter = startDate;
        for (let i = 0; i < 42; i++) {
            dayList.push(iter);
            iter = iter.add({ days: 1 });
        }
        return dayList;
    }, [currentMonth]);

    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <div className={`flex flex-col h-full w-full bg-white/60 backdrop-blur-2xl rounded-xl border border-white/40 shadow-2xl overflow-hidden font-sans text-stone-800 transition-all duration-300 ${className}`}>
            {/* 头部 */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-black/5">
                <div className="flex items-end gap-3">
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-bold tracking-tight">
                            {currentMonth.toLocaleString('en-US', { month: 'long' })}
                        </h2>
                        <span className="text-sm font-medium text-stone-500">
                            {currentMonth.year}
                        </span>
                    </div>
                    {selectedDate === today.toString() && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                            今日
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={goToday}
                        className="px-4 py-1.5 text-sm font-medium bg-stone-200/50 hover:bg-stone-300/50 rounded-md transition-colors"
                    >
                        Today
                    </button>
                    <div className="flex items-center bg-stone-100/50 rounded-md p-0.5">
                        <button onClick={prevMonth} className="p-1.5 hover:bg-white/50 rounded transition-colors" aria-label="Previous Month">
                            <ChevronLeftIcon />
                        </button>
                        <button onClick={nextMonth} className="p-1.5 hover:bg-white/50 rounded transition-colors" aria-label="Next Month">
                            <ChevronRightIcon />
                        </button>
                    </div>
                </div>
            </header>

            {/* 星期表头 */}
            <div className="grid grid-cols-7 px-4 py-2 text-xs font-semibold text-stone-400 uppercase tracking-wider">
                {weekDays.map(day => (
                    <div key={day} className="text-center py-1">{day}</div>
                ))}
            </div>

            {/* 日期网格 */}
            <div className="flex-1 grid grid-cols-7 grid-rows-6 px-4 pb-4 gap-1">
                {days.map(date => {
                    const dateStr = date.toString();
                    const isCurrentMonth = date.month === currentMonth.month;
                    const isToday = date.equals(today);
                    const isPublished = publishedDays.includes(dateStr);
                    const isSelected = selectedDate === dateStr;

                    const dayClassName = `
                        relative group flex flex-col p-2 rounded-lg transition-all duration-200
                        ${!isCurrentMonth ? 'opacity-30' : 'opacity-100'}
                        ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' :
                            isToday ? 'bg-blue-100/50 text-blue-700' : 'hover:bg-stone-100/50'}
                        ${!isSelected && !isToday && isPublished ? 'bg-amber-50 ring-1 ring-amber-300' : ''}
                        cursor-pointer
                    `;

                    const content = (
                        <>
                            <span className={`
                                text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
                                ${isToday && !isSelected ? 'bg-blue-100' : ''}
                            `}>
                                {date.day}
                            </span>
                            {isToday ? (
                                <span className={`mt-1 text-[10px] font-semibold tracking-widest ${isSelected || isToday ? 'opacity-80' : ''}`}>
                                    Today
                                </span>
                            ) : null}

                            {/* 事件指示 */}
                            <div className="flex gap-1 mt-auto mx-auto h-1.5">
                                {isPublished && (
                                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : isToday ? 'bg-blue-400' : 'bg-amber-500'}`} />
                                )}
                            </div>
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

                    // 未提供 onSelectDate 时回退为 href 行为
                    const href = dayHrefBase ? `${dayHrefBase}/${dateStr}` : undefined;
                    if (href) {
                        return (
                            <a
                                key={dateStr}
                                href={href}
                                aria-label={`Open ${dateStr}`}
                                aria-current={isToday ? 'date' : undefined}
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
