export interface DailyRewardConfig {
	daily_coins_min: number;
	daily_coins_max: number;
	daily_xp_min: number;
	daily_xp_max: number;
}

export const getDailyClaimCooldown = ({
	lastDailyAt,
	now = new Date(),
}: {
	lastDailyAt: string | null;
	now?: Date;
}): {
	canClaim: boolean;
	hoursLeft: number;
	minutesLeft: number;
} => {
	if (!lastDailyAt) {
		return { canClaim: true, hoursLeft: 0, minutesLeft: 0 };
	}

	const lastDaily = new Date(lastDailyAt);
	const hoursSince = (now.getTime() - lastDaily.getTime()) / (1000 * 60 * 60);

	if (hoursSince >= 24) {
		return { canClaim: true, hoursLeft: 0, minutesLeft: 0 };
	}

	const totalMinutesLeft = Math.ceil((24 - hoursSince) * 60);
	const hoursLeft = Math.floor(totalMinutesLeft / 60);
	const minutesLeft = totalMinutesLeft % 60;

	return { canClaim: false, hoursLeft, minutesLeft };
};

export const calculateDailyStreak = ({
	lastDailyAt,
	currentStreak,
	now = new Date(),
}: {
	lastDailyAt: string | null;
	currentStreak: number;
	now?: Date;
}): { newStreak: number; streakBroken: boolean } => {
	if (!lastDailyAt) return { newStreak: 1, streakBroken: false };

	const lastDaily = new Date(lastDailyAt);
	const hoursSince = (now.getTime() - lastDaily.getTime()) / (1000 * 60 * 60);

	if (hoursSince < 48) {
		return { newStreak: currentStreak + 1, streakBroken: false };
	}

	return { newStreak: 1, streakBroken: currentStreak > 1 };
};

export const randomIntInRange = ({
	min,
	max,
	rng = Math.random,
}: {
	min: number;
	max: number;
	rng?: () => number;
}): number => {
	return Math.floor(rng() * (max - min + 1)) + min;
};

export const getStreakMultiplier = (
	streak: number,
): {
	multiplier: number;
	bonusText: string;
} => {
	if (streak >= 30) {
		return { multiplier: 2.5, bonusText: "30+ day streak: **2.5x**" };
	}
	if (streak >= 14) {
		return { multiplier: 2, bonusText: "14+ day streak: **2x**" };
	}
	if (streak >= 7) {
		return { multiplier: 1.5, bonusText: "7+ day streak: **1.5x**" };
	}
	return { multiplier: 1, bonusText: "" };
};

export const rollDailyBoost = (
	rng: () => number = Math.random,
): { coinBoost: boolean; xpBoost: boolean; boostText: string } => {
	const boostRoll = rng();
	if (boostRoll < 0.02) {
		return {
			coinBoost: true,
			xpBoost: true,
			boostText: "**JACKPOT!** Both coins AND XP doubled!",
		};
	}
	if (boostRoll < 0.06) {
		return {
			coinBoost: true,
			xpBoost: false,
			boostText: "**Lucky!** Coins doubled!",
		};
	}
	if (boostRoll < 0.1) {
		return {
			coinBoost: false,
			xpBoost: true,
			boostText: "**Lucky!** XP doubled!",
		};
	}
	return { coinBoost: false, xpBoost: false, boostText: "" };
};

export const calculateDailyRewards = ({
	config,
	streak,
	rng = Math.random,
}: {
	config: DailyRewardConfig;
	streak: number;
	rng?: () => number;
}): {
	baseCoins: number;
	baseXP: number;
	finalCoins: number;
	finalXP: number;
	streakMultiplier: number;
	streakBonusText: string;
	coinBoost: boolean;
	xpBoost: boolean;
	boostText: string;
} => {
	const baseCoins = randomIntInRange({
		min: config.daily_coins_min,
		max: config.daily_coins_max,
		rng,
	});
	const baseXP = randomIntInRange({
		min: config.daily_xp_min,
		max: config.daily_xp_max,
		rng,
	});

	const { multiplier, bonusText } = getStreakMultiplier(streak);
	const { coinBoost, xpBoost, boostText } = rollDailyBoost(rng);

	let finalCoins = Math.floor(baseCoins * multiplier);
	let finalXP = Math.floor(baseXP * multiplier);

	if (coinBoost) finalCoins *= 2;
	if (xpBoost) finalXP *= 2;

	return {
		baseCoins,
		baseXP,
		finalCoins,
		finalXP,
		streakMultiplier: multiplier,
		streakBonusText: bonusText,
		coinBoost,
		xpBoost,
		boostText,
	};
};
