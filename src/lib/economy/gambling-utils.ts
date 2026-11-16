// Slot machine symbols and their weights
export const SLOT_SYMBOLS = [
	{ symbol: "🍒", weight: 30, name: "Cherry" },
	{ symbol: "🍋", weight: 25, name: "Lemon" },
	{ symbol: "🍊", weight: 20, name: "Orange" },
	{ symbol: "🍇", weight: 15, name: "Grape" },
	{ symbol: "💎", weight: 8, name: "Diamond" },
	{ symbol: "7️⃣", weight: 2, name: "Seven" },
];

export const SLOT_PAYOUTS: Record<string, number> = {
	"🍒🍒🍒": 2,
	"🍋🍋🍋": 3,
	"🍊🍊🍊": 4,
	"🍇🍇🍇": 5,
	"💎💎💎": 10,
	"7️⃣7️⃣7️⃣": 25,
};

// Weighted random selection for slots
export const spinSlotReel = (): string => {
	const totalWeight = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
	let random = Math.random() * totalWeight;

	for (const symbolObj of SLOT_SYMBOLS) {
		random -= symbolObj.weight;
		if (random <= 0) {
			return symbolObj.symbol;
		}
	}

	return SLOT_SYMBOLS[0].symbol;
};

// Spin all three reels
export const spinSlots = (): [string, string, string] => {
	return [spinSlotReel(), spinSlotReel(), spinSlotReel()];
};

// Check slot result
export const getSlotPayout = (reels: [string, string, string]): number => {
	const key = reels.join("");
	return SLOT_PAYOUTS[key] ?? 0;
};

// Blackjack card utilities
export const CARD_SUITS = ["♠", "♥", "♦", "♣"] as const;
export const CARD_VALUES = [
	"A",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"10",
	"J",
	"Q",
	"K",
] as const;

export interface Card {
	suit: (typeof CARD_SUITS)[number];
	value: (typeof CARD_VALUES)[number];
}

export const createDeck = (): Card[] => {
	const deck: Card[] = [];
	for (const suit of CARD_SUITS) {
		for (const value of CARD_VALUES) {
			deck.push({ suit, value });
		}
	}
	return deck;
};

export const shuffleDeck = (deck: Card[]): Card[] => {
	const shuffled = [...deck];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
};

export const getCardValue = (card: Card): number[] => {
	if (card.value === "A") return [1, 11];
	if (["J", "Q", "K"].includes(card.value)) return [10];
	return [Number.parseInt(card.value)];
};

export const getHandValue = (hand: Card[]): number => {
	let values = [0];

	for (const card of hand) {
		const cardValues = getCardValue(card);
		const newValues: number[] = [];

		for (const currentValue of values) {
			for (const cardValue of cardValues) {
				newValues.push(currentValue + cardValue);
			}
		}

		values = [...new Set(newValues)];
	}

	// Get best value that's <= 21, or lowest if all bust
	const validValues = values.filter((v) => v <= 21);
	if (validValues.length > 0) {
		return Math.max(...validValues);
	}
	return Math.min(...values);
};

export const formatCard = (card: Card): string => {
	const suitColors: Record<string, string> = {
		"♠": "♠️",
		"♣": "♣️",
		"♥": "♥️",
		"♦": "♦️",
	};
	return `${card.value}${suitColors[card.suit]}`;
};

export const formatHand = (hand: Card[]): string => {
	return hand.map(formatCard).join(" ");
};

export const isBlackjack = (hand: Card[]): boolean => {
	return hand.length === 2 && getHandValue(hand) === 21;
};

export const isBust = (hand: Card[]): boolean => {
	return getHandValue(hand) > 21;
};

export interface GambleConfig {
	enabled: boolean;
	min_bet: number;
	max_bet: number;
}

export interface GambleUser {
	level: number;
	coins: number;
}

export const evaluateGambleEligibility = ({
	config,
	user,
	amount,
	requiredLevel = 1,
}: {
	config: GambleConfig;
	user: GambleUser;
	amount: number;
	requiredLevel?: number;
}): { allowed: boolean; reason?: string } => {
	if (!config.enabled) {
		return { allowed: false, reason: "Economy is disabled in this server." };
	}

	if (user.level < requiredLevel) {
		return {
			allowed: false,
			reason: `You need to be level ${requiredLevel} to use this game.`,
		};
	}

	if (amount < config.min_bet) {
		return {
			allowed: false,
			reason: `Minimum bet is ${config.min_bet} coins.`,
		};
	}

	if (amount > config.max_bet) {
		return {
			allowed: false,
			reason: `Maximum bet is ${config.max_bet.toLocaleString()} coins.`,
		};
	}

	if (user.coins < amount) {
		return {
			allowed: false,
			reason: `You don't have enough coins. You have ${user.coins.toLocaleString()} coins.`,
		};
	}

	return { allowed: true };
};

export const calculateGamblingPayout = ({
	bet,
	multiplier,
}: {
	bet: number;
	multiplier: number;
}): { payout: number; netGain: number } => {
	const payout = Math.floor(bet * multiplier);
	return { payout, netGain: payout - bet };
};
