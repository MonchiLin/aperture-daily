export const BUSINESS_TIMEZONE = 'Asia/Shanghai';

export function getBusinessDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}
