import { describe, expect, test } from "bun:test";
import { calculateLineValueFromAverage, formatLine, formatLineWithOdds } from "../line-utils";

describe("line utils", () => {
	test("calculateLineValueFromAverage rounds for leaderboard position", () => {
		expect(
			calculateLineValueFromAverage({
				metric: "leaderboard_position",
				average: 13,
			}),
		).toBe(15);
		expect(
			calculateLineValueFromAverage({
				metric: "leaderboard_position",
				average: 2,
			}),
		).toBe(1);
	});

	test("calculateLineValueFromAverage rounds small averages to nearest 5", () => {
		expect(calculateLineValueFromAverage({ metric: "messages", average: 42 })).toBe(40);
	});

	test("calculateLineValueFromAverage rounds medium averages to nearest 25", () => {
		expect(calculateLineValueFromAverage({ metric: "xp", average: 420 })).toBe(425);
	});

	test("calculateLineValueFromAverage rounds large averages to nearest 100", () => {
		expect(calculateLineValueFromAverage({ metric: "messages", average: 1200 })).toBe(1200);
		expect(calculateLineValueFromAverage({ metric: "messages", average: 1251 })).toBe(1300);
	});

	test("formatLine formats values per metric", () => {
		expect(formatLine({ metric: "messages", lineValue: 10 })).toBe("10 messages");
		expect(formatLine({ metric: "xp", lineValue: 1000 })).toBe("1,000 XP");
		expect(formatLine({ metric: "leaderboard_position", lineValue: 3 })).toBe("#3");
	});

	test("formatLineWithOdds appends multiplier", () => {
		expect(
			formatLineWithOdds({
				metric: "voice_minutes",
				lineValue: 60,
				multiplier: 1.5,
			}),
		).toBe("60 minutes (1.5x)");
	});
});
