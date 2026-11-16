import { describe, expect, test } from "bun:test";
import {
	ALL_METRICS,
	calculateAverage,
	getMetricDescription,
	getMetricDisplayName,
} from "../metrics-utils";

describe("metrics utils", () => {
	test("calculateAverage returns 0 for empty set", () => {
		expect(calculateAverage([])).toBe(0);
	});

	test("calculateAverage rounds to nearest integer", () => {
		expect(calculateAverage([1, 2, 2])).toBe(2);
	});

	test("metric display names are stable", () => {
		expect(getMetricDisplayName("messages")).toBe("Messages");
		expect(getMetricDisplayName("leaderboard_position")).toBe("Leaderboard Position");
	});

	test("metric descriptions are stable", () => {
		expect(getMetricDescription("xp")).toBe("Total XP earned this week");
		expect(getMetricDescription("voice_minutes")).toBe("Minutes spent in voice channels");
	});

	test("ALL_METRICS includes core metrics", () => {
		expect(ALL_METRICS).toContain("messages");
		expect(ALL_METRICS).toContain("leaderboard_position");
	});
});
