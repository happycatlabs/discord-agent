import { describe, expect, test } from "bun:test";
import { calculateDailyRewards, calculateDailyStreak, getDailyClaimCooldown } from "../daily-utils";

describe("daily utils", () => {
	test("getDailyClaimCooldown allows claim when never claimed", () => {
		expect(getDailyClaimCooldown({ lastDailyAt: null }).canClaim).toBe(true);
	});

	test("getDailyClaimCooldown blocks within 24 hours", () => {
		const now = new Date("2025-01-02T12:00:00.000Z");
		const lastDaily = new Date("2025-01-01T13:00:00.000Z");
		const result = getDailyClaimCooldown({
			lastDailyAt: lastDaily.toISOString(),
			now,
		});
		expect(result.canClaim).toBe(false);
		expect(result.hoursLeft).toBe(1);
	});

	test("calculateDailyStreak increments within 48 hours", () => {
		const now = new Date("2025-01-02T12:00:00.000Z");
		const lastDaily = new Date("2025-01-01T14:00:00.000Z");
		const result = calculateDailyStreak({
			lastDailyAt: lastDaily.toISOString(),
			currentStreak: 3,
			now,
		});
		expect(result).toEqual({ newStreak: 4, streakBroken: false });
	});

	test("calculateDailyStreak resets after 48 hours", () => {
		const now = new Date("2025-01-02T12:00:00.000Z");
		const lastDaily = new Date("2024-12-31T10:00:00.000Z");
		const result = calculateDailyStreak({
			lastDailyAt: lastDaily.toISOString(),
			currentStreak: 5,
			now,
		});
		expect(result).toEqual({ newStreak: 1, streakBroken: true });
	});

	test("calculateDailyRewards honors streak and boost", () => {
		const rngValues = [0, 0, 0.01];
		const rng = () => rngValues.shift() ?? 0;
		const result = calculateDailyRewards({
			config: {
				daily_coins_min: 100,
				daily_coins_max: 100,
				daily_xp_min: 50,
				daily_xp_max: 50,
			},
			streak: 7,
			rng,
		});

		expect(result.finalCoins).toBe(300); // 100 * 1.5 * 2
		expect(result.finalXP).toBe(150); // 50 * 1.5 * 2
		expect(result.boostText).toContain("JACKPOT");
	});
});
