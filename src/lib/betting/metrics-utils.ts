import type { BettingMetric } from "../db/betting";

// Calculate average of historical values
export const calculateAverage = (values: number[]): number => {
	if (values.length === 0) return 0;
	const sum = values.reduce((a, b) => a + b, 0);
	return Math.round(sum / values.length);
};

// Get metric display name
export const getMetricDisplayName = (metric: BettingMetric): string => {
	const names: Record<BettingMetric, string> = {
		messages: "Messages",
		xp: "XP Earned",
		voice_minutes: "Voice Minutes",
		streak_days: "Daily Streak",
		leaderboard_position: "Leaderboard Position",
	};
	return names[metric] ?? metric;
};

// Get metric description
export const getMetricDescription = (metric: BettingMetric): string => {
	const descriptions: Record<BettingMetric, string> = {
		messages: "Total messages sent this week",
		xp: "Total XP earned this week",
		voice_minutes: "Minutes spent in voice channels",
		streak_days: "Current daily claim streak",
		leaderboard_position: "Final weekly XP leaderboard position",
	};
	return descriptions[metric] ?? "";
};

// All available metrics
export const ALL_METRICS: BettingMetric[] = [
	"messages",
	"xp",
	"voice_minutes",
	"streak_days",
	"leaderboard_position",
];
