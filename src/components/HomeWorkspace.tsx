import { useState } from 'react';
import { MacOSCalendar } from './MacOSCalender';
import DayDetailsSidebar from './DayDetailsSidebar';
import dayjs from 'dayjs';

type HomeWorkspaceProps = {
    publishedDays: string[];
    initialDate?: string;
};

export default function HomeWorkspace({ publishedDays, initialDate }: HomeWorkspaceProps) {
    // 初始状态默认今天（符合常见日历行为）。
    const [selectedDate, setSelectedDate] = useState<string | null>(
        initialDate || dayjs().format('YYYY-MM-DD')
    );

    return (
        <div className="relative w-full max-w-7xl mx-auto px-4 py-8 md:py-12">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
                {/* Left Column: Calendar (Index) */}
                <div className="md:col-span-4 lg:col-span-4 sticky top-24">
                    <MacOSCalendar
                        className="w-full"
                        publishedDays={publishedDays}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                        dayHrefBase={undefined}
                    />
                </div>

                {/* Right Column: Feed (Content) */}
                <div className="md:col-span-8 lg:col-span-8 min-h-[500px]">
                    <DayDetailsSidebar
                        date={selectedDate}
                        className="w-full"
                    />
                </div>
            </div>
        </div>
    );
}
