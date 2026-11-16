// Pure date utilities for weekly betting windows (UTC-based)

export const getWeekStart = (date: Date = new Date()): string => {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	const day = d.getUTCDay();
	d.setUTCDate(d.getUTCDate() - day);
	return d.toISOString();
};

export const getWeekEnd = (date: Date = new Date()): string => {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	const day = d.getUTCDay();
	d.setUTCDate(d.getUTCDate() + (7 - day));
	return d.toISOString();
};

export const getPreviousWeekStart = (now: Date = new Date()): string => {
	const prevWeekDate = new Date(now);
	prevWeekDate.setUTCDate(prevWeekDate.getUTCDate() - 7);
	return getWeekStart(prevWeekDate);
};

export const getPreviousWeekEnd = (previousWeekStart: string): string => {
	const endDate = new Date(previousWeekStart);
	endDate.setUTCDate(endDate.getUTCDate() + 7);
	return endDate.toISOString();
};

export const getPreviousWeekRange = (now: Date = new Date()): { start: string; end: string } => {
	const start = getPreviousWeekStart(now);
	const end = getPreviousWeekEnd(start);
	return { start, end };
};
