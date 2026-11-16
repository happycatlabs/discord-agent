import { describe, expect, test } from "bun:test";
import { getWinningDirection, shouldSeedWeekResolution } from "../resolution-utils";

describe("resolution utils", () => {
	test("getWinningDirection returns over/under/push", () => {
		expect(getWinningDirection({ actualValue: 10, lineValue: 5 })).toBe("over");
		expect(getWinningDirection({ actualValue: 5, lineValue: 10 })).toBe("under");
		expect(getWinningDirection({ actualValue: 7, lineValue: 7 })).toBe("push");
	});

	test("does not seed when no history exists", () => {
		expect(shouldSeedWeekResolution({ historyCount: 0, unresolvedCount: 0 })).toBe(false);
	});

	test("does not seed when unresolved bets exist", () => {
		expect(shouldSeedWeekResolution({ historyCount: 5, unresolvedCount: 2 })).toBe(false);
	});

	test("seeds when history exists and all bets are resolved", () => {
		expect(shouldSeedWeekResolution({ historyCount: 3, unresolvedCount: 0 })).toBe(true);
	});
});
