import type { BettingMetric } from "../db/betting";

export const calculateLineValueFromAverage = ({
	metric,
	average,
}: {
	metric: BettingMetric;
	average: number;
}): number => {
	// For leaderboard position, we want to be more conservative
	// since lower is better and there's more variance
	if (metric === "leaderboard_position") {
		// Round to nearest 5 for cleaner lines
		return Math.max(1, Math.round(average / 5) * 5);
	}

	// For other metrics, use the average with some rounding
	// Round to make betting more interesting
	if (average < 50) {
		// Small numbers - round to nearest 5
		return Math.max(0, Math.round(average / 5) * 5);
	}
	if (average < 500) {
		// Medium numbers - round to nearest 25
		return Math.round(average / 25) * 25;
	}
	// Large numbers - round to nearest 100
	return Math.round(average / 100) * 100;
};

// Format a line for display
export const formatLine = ({
	metric,
	lineValue,
}: {
	metric: BettingMetric;
	lineValue: number;
}): string => {
	switch (metric) {
		case "messages":
			return `${lineValue} messages`;
		case "xp":
			return `${lineValue.toLocaleString()} XP`;
		case "voice_minutes":
			return `${lineValue} minutes`;
		case "streak_days":
			return `${lineValue} days`;
		case "leaderboard_position":
			return `#${lineValue}`;
		default:
			return `${lineValue}`;
	}
};

// Format line with over/under
export const formatLineWithOdds = ({
	metric,
	lineValue,
	multiplier,
}: {
	metric: BettingMetric;
	lineValue: number;
	multiplier: number;
}): string => {
	const formattedLine = formatLine({ metric, lineValue });
	return `${formattedLine} (${multiplier}x)`;
};
