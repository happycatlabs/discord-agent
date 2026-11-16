import {
	type BettingLine,
	type BettingMetric,
	getOrCreateBettingLine,
	getWeekStart,
} from "../db/betting";
import { calculateLineValueFromAverage } from "./line-utils";
import { calculateAverage, getHistoricalMetrics } from "./metrics";
export { calculateLineValueFromAverage, formatLine, formatLineWithOdds } from "./line-utils";

// Calculate a betting line value based on historical performance
export const calculateLineValue = ({
	serverId,
	userId,
	metric,
}: {
	serverId: string;
	userId: string;
	metric: BettingMetric;
}): number => {
	// Get last 3 weeks of data
	const historical = getHistoricalMetrics({
		serverId,
		userId,
		metric,
		weeks: 3,
	});

	const average = calculateAverage(historical);
	return calculateLineValueFromAverage({ metric, average });
};

// Get or calculate a betting line for a user/metric
export const getOrCalculateLine = ({
	serverId,
	userId,
	metric,
}: {
	serverId: string;
	userId: string;
	metric: BettingMetric;
}): BettingLine => {
	const weekStart = getWeekStart();
	const lineValue = calculateLineValue({ serverId, userId, metric });

	return getOrCreateBettingLine({
		serverId,
		targetUserId: userId,
		metric,
		lineValue,
		weekStart,
	});
};
