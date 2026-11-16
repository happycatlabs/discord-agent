import { getEconomyConfig, getOrCreateUserEconomy, updateUserCoins } from "../db/economy";
import { calculateGamblingPayout, evaluateGambleEligibility } from "./gambling-utils";
export {
	CARD_SUITS,
	CARD_VALUES,
	type Card,
	calculateGamblingPayout,
	evaluateGambleEligibility,
	SLOT_PAYOUTS,
	SLOT_SYMBOLS,
	createDeck,
	formatCard,
	formatHand,
	getCardValue,
	getHandValue,
	getSlotPayout,
	isBlackjack,
	isBust,
	shuffleDeck,
	spinSlotReel,
	spinSlots,
} from "./gambling-utils";

export interface GambleResult {
	success: boolean;
	error?: string;
	bet?: number;
	payout?: number;
	netGain?: number;
}

// Check if user can gamble
export const canGamble = ({
	serverId,
	userId,
	amount,
	requiredLevel = 1,
}: {
	serverId: string;
	userId: string;
	amount: number;
	requiredLevel?: number;
}): { allowed: boolean; reason?: string } => {
	const config = getEconomyConfig({ serverId });

	const user = getOrCreateUserEconomy({ serverId, userId });
	return evaluateGambleEligibility({
		config: { ...config, enabled: Boolean(config.enabled) },
		user,
		amount,
		requiredLevel,
	});
};

// Process a gambling win
export const processWin = ({
	serverId,
	userId,
	bet,
	multiplier,
}: {
	serverId: string;
	userId: string;
	bet: number;
	multiplier: number;
}): number => {
	const { payout, netGain } = calculateGamblingPayout({ bet, multiplier });
	updateUserCoins({
		serverId,
		userId,
		amount: netGain,
		trackTotal: netGain > 0,
	});
	return payout;
};

// Process a gambling loss
export const processLoss = ({
	serverId,
	userId,
	bet,
}: {
	serverId: string;
	userId: string;
	bet: number;
}): void => {
	updateUserCoins({ serverId, userId, amount: -bet, trackTotal: false });
};
