import { describe, expect, test } from "bun:test";
import {
	CARD_SUITS,
	CARD_VALUES,
	SLOT_PAYOUTS,
	SLOT_SYMBOLS,
	calculateGamblingPayout,
	createDeck,
	evaluateGambleEligibility,
	formatCard,
	getCardValue,
	getHandValue,
	getSlotPayout,
	isBlackjack,
	isBust,
	shuffleDeck,
	spinSlotReel,
	type Card,
} from "../gambling-utils";

describe("gambling utils", () => {
	test("createDeck builds 52 unique cards", () => {
		const deck = createDeck();
		expect(deck.length).toBe(CARD_SUITS.length * CARD_VALUES.length);
		const keys = new Set(deck.map((card) => `${card.value}-${card.suit}`));
		expect(keys.size).toBe(deck.length);
	});

	test("shuffleDeck preserves card set", () => {
		const deck = createDeck();
		const shuffled = shuffleDeck(deck);
		expect(shuffled.length).toBe(deck.length);
		const original = new Set(deck.map((card) => `${card.value}-${card.suit}`));
		const result = new Set(shuffled.map((card) => `${card.value}-${card.suit}`));
		expect(result).toEqual(original);
	});

	test("getCardValue returns correct values", () => {
		expect(getCardValue({ suit: "♠", value: "A" })).toEqual([1, 11]);
		expect(getCardValue({ suit: "♠", value: "K" })).toEqual([10]);
		expect(getCardValue({ suit: "♠", value: "7" })).toEqual([7]);
	});

	test("getHandValue prefers best non-bust value", () => {
		const hand: Card[] = [
			{ suit: "♠", value: "A" },
			{ suit: "♦", value: "9" },
			{ suit: "♣", value: "9" },
		];
		expect(getHandValue(hand)).toBe(19);
	});

	test("isBlackjack detects blackjack", () => {
		const hand: Card[] = [
			{ suit: "♠", value: "A" },
			{ suit: "♦", value: "K" },
		];
		expect(isBlackjack(hand)).toBe(true);
		expect(isBlackjack([...hand, { suit: "♣", value: "2" }])).toBe(false);
	});

	test("isBust detects bust", () => {
		const hand: Card[] = [
			{ suit: "♠", value: "10" },
			{ suit: "♦", value: "9" },
			{ suit: "♣", value: "5" },
		];
		expect(isBust(hand)).toBe(true);
	});

	test("formatCard adds suit emoji", () => {
		expect(formatCard({ suit: "♠", value: "A" })).toBe("A♠️");
	});

	test("getSlotPayout returns configured payouts", () => {
		expect(getSlotPayout(["🍒", "🍒", "🍒"])).toBe(SLOT_PAYOUTS["🍒🍒🍒"]);
		expect(getSlotPayout(["🍒", "🍋", "🍒"])).toBe(0);
	});

	test("spinSlotReel returns a valid symbol", () => {
		const originalRandom = Math.random;
		try {
			Math.random = () => 0;
			expect(spinSlotReel()).toBe(SLOT_SYMBOLS[0].symbol);
		} finally {
			Math.random = originalRandom;
		}
	});

	test("evaluateGambleEligibility enforces config and balance", () => {
		const config = { enabled: true, min_bet: 10, max_bet: 100 };
		const user = { level: 5, coins: 50 };

		expect(
			evaluateGambleEligibility({
				config,
				user,
				amount: 5,
				requiredLevel: 1,
			}).allowed,
		).toBe(false);
		expect(
			evaluateGambleEligibility({
				config,
				user,
				amount: 150,
				requiredLevel: 1,
			}).allowed,
		).toBe(false);
		expect(
			evaluateGambleEligibility({
				config,
				user,
				amount: 20,
				requiredLevel: 10,
			}).allowed,
		).toBe(false);
		expect(
			evaluateGambleEligibility({
				config,
				user: { level: 5, coins: 5 },
				amount: 20,
				requiredLevel: 1,
			}).allowed,
		).toBe(false);
		expect(
			evaluateGambleEligibility({
				config,
				user,
				amount: 20,
				requiredLevel: 1,
			}).allowed,
		).toBe(true);
	});

	test("calculateGamblingPayout floors payout and returns net gain", () => {
		expect(calculateGamblingPayout({ bet: 50, multiplier: 2.5 })).toEqual({
			payout: 125,
			netGain: 75,
		});
	});
});
