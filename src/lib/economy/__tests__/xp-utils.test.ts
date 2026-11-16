import { describe, expect, test } from "bun:test";
import {
	calculateReactionXp,
	calculateVoiceXp,
	calculateXpAward,
	canEarnXp,
	levelFromXp,
	randomXp,
	shouldAttemptReactionXp,
	totalXpForLevel,
	xpForLevel,
	xpProgressInLevel,
} from "../xp-utils";

describe("xp utils", () => {
	test("xpForLevel follows formula", () => {
		expect(xpForLevel(1)).toBe(155);
		expect(xpForLevel(2)).toBe(220);
	});

	test("totalXpForLevel sums prior levels", () => {
		expect(totalXpForLevel(1)).toBe(0);
		expect(totalXpForLevel(2)).toBe(155);
		expect(totalXpForLevel(3)).toBe(375);
	});

	test("levelFromXp handles boundaries", () => {
		expect(levelFromXp(0)).toBe(1);
		expect(levelFromXp(154)).toBe(1);
		expect(levelFromXp(155)).toBe(2);
	});

	test("xpProgressInLevel reports current progress", () => {
		const progress = xpProgressInLevel(155, 2);
		expect(progress).toEqual({ current: 0, needed: 220, percentage: 0 });
	});

	test("calculateXpAward returns leveled-up info and coin rewards", () => {
		const award = calculateXpAward({
			currentXp: 150,
			currentLevel: 1,
			xpGain: 10,
		});
		expect(award).toEqual({
			newXp: 160,
			newLevel: 2,
			leveledUp: true,
			coinsAwarded: 100,
		});
	});

	test("randomXp respects min/max bounds", () => {
		const originalRandom = Math.random;
		try {
			Math.random = () => 0;
			expect(randomXp({ xp_min: 5, xp_max: 10 })).toBe(5);

			Math.random = () => 0.999999;
			expect(randomXp({ xp_min: 5, xp_max: 10 })).toBe(10);
		} finally {
			Math.random = originalRandom;
		}
	});

	test("canEarnXp enforces cooldown", () => {
		const cooldownSeconds = 60;
		const now = Date.now();
		const recent = new Date(now - 10 * 1000).toISOString();
		const past = new Date(now - 61 * 1000).toISOString();

		expect(canEarnXp({ last_xp_at: null }, { xp_cooldown_seconds: cooldownSeconds })).toBe(true);
		expect(canEarnXp({ last_xp_at: recent }, { xp_cooldown_seconds: cooldownSeconds })).toBe(false);
		expect(canEarnXp({ last_xp_at: past }, { xp_cooldown_seconds: cooldownSeconds })).toBe(true);
	});

	test("calculateVoiceXp respects minimum session duration", () => {
		expect(
			calculateVoiceXp({
				durationSeconds: 30,
				xpPerMinute: 2,
				minSessionSeconds: 60,
			}),
		).toEqual({ xpGain: 0, minutes: 0 });
	});

	test("calculateVoiceXp converts minutes to XP", () => {
		expect(
			calculateVoiceXp({
				durationSeconds: 125,
				xpPerMinute: 3,
				minSessionSeconds: 60,
			}),
		).toEqual({ xpGain: 6, minutes: 2 });
	});

	test("calculateReactionXp floors and clamps values", () => {
		expect(calculateReactionXp({ baseXp: 4.9 })).toBe(4);
		expect(calculateReactionXp({ baseXp: -5 })).toBe(0);
	});

	test("shouldAttemptReactionXp blocks bot/self reactions", () => {
		expect(shouldAttemptReactionXp({ authorIsBot: true, isSelfReaction: false })).toBe(false);
		expect(shouldAttemptReactionXp({ authorIsBot: false, isSelfReaction: true })).toBe(false);
		expect(shouldAttemptReactionXp({ authorIsBot: false, isSelfReaction: false })).toBe(true);
	});
});
