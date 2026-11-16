import type { BettingMetric } from "../db/betting";

// Betting cutoff days (1=Sunday, 7=Saturday)
export const METRIC_CUTOFFS: Record<BettingMetric, number> = {
	messages: 4, // Wednesday
	xp: 5, // Thursday
	voice_minutes: 5, // Thursday
	streak_days: 7, // Saturday
	leaderboard_position: 6, // Friday
};

// Odds multipliers by day of week (0=Sunday, 6=Saturday)
export const DAY_MULTIPLIERS: Record<number, number> = {
	0: 2.0, // Sunday
	1: 1.8, // Monday
	2: 1.6, // Tuesday
	3: 1.4, // Wednesday
	4: 1.25, // Thursday
	5: 1.1, // Friday
	6: 1.05, // Saturday
};

export const getDayNumber = (date: Date): number => {
	const day = date.getUTCDay();
	return day === 0 ? 1 : day + 1;
};

export const canBetOnMetric = (metric: BettingMetric, date: Date = new Date()): boolean => {
	const dayNumber = getDayNumber(date);
	// Use <= to allow betting through the cutoff day (closes at midnight UTC)
	return dayNumber <= METRIC_CUTOFFS[metric];
};

export const getMultiplierForDay = (day: number): number => {
	return DAY_MULTIPLIERS[day] ?? 1.0;
};

export const getCurrentMultiplier = (date: Date = new Date()): number => {
	return getMultiplierForDay(date.getUTCDay());
};
