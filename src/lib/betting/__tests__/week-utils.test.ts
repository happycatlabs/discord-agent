import { describe, expect, test } from "bun:test";
import {
	getPreviousWeekEnd,
	getPreviousWeekRange,
	getPreviousWeekStart,
	getWeekEnd,
	getWeekStart,
} from "../week-utils";

describe("week utils", () => {
	test("getWeekStart returns UTC Sunday midnight for midweek date", () => {
		const date = new Date("2025-01-08T12:34:56.789Z"); // Wednesday
		expect(getWeekStart(date)).toBe("2025-01-05T00:00:00.000Z");
	});

	test("getWeekEnd returns next Sunday midnight for midweek date", () => {
		const date = new Date("2025-01-08T12:34:56.789Z"); // Wednesday
		expect(getWeekEnd(date)).toBe("2025-01-12T00:00:00.000Z");
	});

	test("getWeekEnd advances one week when date is Sunday", () => {
		const date = new Date("2025-01-05T05:00:00.000Z"); // Sunday
		expect(getWeekEnd(date)).toBe("2025-01-12T00:00:00.000Z");
	});

	test("getPreviousWeekStart uses prior week start", () => {
		const now = new Date("2025-01-08T12:34:56.000Z");
		expect(getPreviousWeekStart(now)).toBe("2024-12-29T00:00:00.000Z");
	});

	test("getPreviousWeekEnd is start plus seven days", () => {
		const start = "2024-12-29T00:00:00.000Z";
		expect(getPreviousWeekEnd(start)).toBe("2025-01-05T00:00:00.000Z");
	});

	test("getPreviousWeekRange returns consistent start/end", () => {
		const now = new Date("2025-01-08T12:34:56.000Z");
		expect(getPreviousWeekRange(now)).toEqual({
			start: "2024-12-29T00:00:00.000Z",
			end: "2025-01-05T00:00:00.000Z",
		});
	});
});
