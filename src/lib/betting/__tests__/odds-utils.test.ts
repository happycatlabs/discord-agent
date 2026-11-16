import { describe, expect, test } from "bun:test";
import {
	DAY_MULTIPLIERS,
	METRIC_CUTOFFS,
	canBetOnMetric,
	getCurrentMultiplier,
	getDayNumber,
	getMultiplierForDay,
} from "../odds-utils";

describe("odds utils", () => {
	test("getDayNumber maps Sunday to 1 and Saturday to 7", () => {
		expect(getDayNumber(new Date("2025-01-05T00:00:00.000Z"))).toBe(1); // Sunday
		expect(getDayNumber(new Date("2025-01-11T00:00:00.000Z"))).toBe(7); // Saturday
	});

	test("canBetOnMetric allows betting through cutoff day", () => {
		const wednesday = new Date("2025-01-08T12:00:00.000Z");
		const thursday = new Date("2025-01-09T12:00:00.000Z");
		expect(METRIC_CUTOFFS.messages).toBe(4);
		expect(canBetOnMetric("messages", wednesday)).toBe(true);
		expect(canBetOnMetric("messages", thursday)).toBe(false);
	});

	test("getMultiplierForDay returns configured multiplier", () => {
		expect(getMultiplierForDay(0)).toBe(DAY_MULTIPLIERS[0]);
		expect(getMultiplierForDay(6)).toBe(DAY_MULTIPLIERS[6]);
	});

	test("getMultiplierForDay defaults to 1.0 for unknown day", () => {
		expect(getMultiplierForDay(99)).toBe(1.0);
	});

	test("getCurrentMultiplier uses the date's UTC day", () => {
		const monday = new Date("2025-01-06T12:00:00.000Z");
		expect(getCurrentMultiplier(monday)).toBe(DAY_MULTIPLIERS[1]);
	});
});
