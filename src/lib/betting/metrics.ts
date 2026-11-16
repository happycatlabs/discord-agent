import type { BettingMetric } from "../db/betting";
import { getWeekEnd, getWeekStart } from "../db/betting";
import {
	getOrCreateUserEconomy,
	getWeeklyLeaderboardPosition,
	getWeeklyMessageCount,
} from "../db/economy";
import { getVoiceMinutes } from "../db/voice-sessions";

// Get the current value of a metric for a user
export const getMetricValue = ({
	serverId,
	userId,
	metric,
	weekStart,
	weekEnd,
}: {
	serverId: string;
	userId: string;
	metric: BettingMetric;
	weekStart: string;
	weekEnd: string;
}): number => {
	switch (metric) {
		case "messages":
			return getWeeklyMessageCount({ serverId, userId, weekStart, weekEnd });

		case "xp": {
			// For now, estimate from messages (avg 20 XP per message)
			const msgCount = getWeeklyMessageCount({
				serverId,
				userId,
				weekStart,
				weekEnd,
			});
			return msgCount * 20;
		}

		case "voice_minutes":
			return getVoiceMinutes({
				serverId,
				userId,
				startDate: weekStart,
				endDate: weekEnd,
			});

		case "streak_days": {
			const user = getOrCreateUserEconomy({ serverId, userId });
			return user.daily_streak;
		}

		case "leaderboard_position":
			return getWeeklyLeaderboardPosition({
				serverId,
				userId,
				weekStart,
				weekEnd,
			});

		default:
			return 0;
	}
};

// Get historical metric values for a user (last N weeks)
export const getHistoricalMetrics = ({
	serverId,
	userId,
	metric,
	weeks = 3,
}: {
	serverId: string;
	userId: string;
	metric: BettingMetric;
	weeks?: number;
}): number[] => {
	const values: number[] = [];
	const now = new Date();

	for (let i = 1; i <= weeks; i++) {
		// Go back i weeks
		const weekDate = new Date(now);
		weekDate.setDate(weekDate.getDate() - i * 7);

		const weekStart = getWeekStart(weekDate);
		const weekEnd = getWeekEnd(weekDate);

		const value = getMetricValue({
			serverId,
			userId,
			metric,
			weekStart,
			weekEnd,
		});

		values.push(value);
	}

	return values;
};

export {
	ALL_METRICS,
	calculateAverage,
	getMetricDescription,
	getMetricDisplayName,
} from "./metrics-utils";
