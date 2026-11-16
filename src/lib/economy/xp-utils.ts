export interface XpConfig {
	xp_min: number;
	xp_max: number;
	xp_cooldown_seconds: number;
}

export interface XpUserCooldown {
	last_xp_at: string | null;
}

// Level formula: XP needed for level N = 5 * (N^2) + 50*N + 100
export const xpForLevel = (level: number): number => {
	return 5 * level * level + 50 * level + 100;
};

// Total XP needed to reach a level (cumulative)
export const totalXpForLevel = (level: number): number => {
	let total = 0;
	for (let i = 1; i < level; i++) {
		total += xpForLevel(i);
	}
	return total;
};

// Calculate level from total XP
export const levelFromXp = (xp: number): number => {
	let level = 1;
	let totalNeeded = 0;
	while (totalNeeded + xpForLevel(level) <= xp) {
		totalNeeded += xpForLevel(level);
		level++;
	}
	return level;
};

// Get XP progress within current level
export const xpProgressInLevel = (
	xp: number,
	level: number,
): { current: number; needed: number; percentage: number } => {
	const xpAtLevelStart = totalXpForLevel(level);
	const currentLevelXp = xp - xpAtLevelStart;
	const neededForNextLevel = xpForLevel(level);
	const percentage = Math.floor((currentLevelXp / neededForNextLevel) * 100);

	return {
		current: currentLevelXp,
		needed: neededForNextLevel,
		percentage: Math.min(percentage, 100),
	};
};

// Generate random XP within config range
export const randomXp = (config: Pick<XpConfig, "xp_min" | "xp_max">): number => {
	return Math.floor(Math.random() * (config.xp_max - config.xp_min + 1)) + config.xp_min;
};

// Check if user can earn XP (cooldown check)
export const canEarnXp = (
	user: XpUserCooldown,
	config: Pick<XpConfig, "xp_cooldown_seconds">,
): boolean => {
	if (!user.last_xp_at) return true;

	const lastXp = new Date(user.last_xp_at);
	const now = new Date();
	const diffSeconds = (now.getTime() - lastXp.getTime()) / 1000;

	return diffSeconds >= config.xp_cooldown_seconds;
};

export const calculateXpAward = ({
	currentXp,
	currentLevel,
	xpGain,
}: {
	currentXp: number;
	currentLevel: number;
	xpGain: number;
}): {
	newXp: number;
	newLevel: number;
	leveledUp: boolean;
	coinsAwarded: number;
} => {
	const newXp = currentXp + xpGain;
	const newLevel = levelFromXp(newXp);
	const leveledUp = newLevel > currentLevel;
	const coinsAwarded = leveledUp ? newLevel * 50 : 0;

	return {
		newXp,
		newLevel,
		leveledUp,
		coinsAwarded,
	};
};

export const calculateVoiceXp = ({
	durationSeconds,
	xpPerMinute,
	minSessionSeconds = 0,
}: {
	durationSeconds: number;
	xpPerMinute: number;
	minSessionSeconds?: number;
}): { xpGain: number; minutes: number } => {
	if (durationSeconds < minSessionSeconds || xpPerMinute <= 0) {
		return { xpGain: 0, minutes: 0 };
	}

	const minutes = Math.floor(durationSeconds / 60);
	return {
		minutes,
		xpGain: Math.floor(minutes * xpPerMinute),
	};
};

export const calculateReactionXp = ({ baseXp }: { baseXp: number }): number => {
	return Math.max(0, Math.floor(baseXp));
};

export const shouldAttemptReactionXp = ({
	authorIsBot,
	isSelfReaction,
}: {
	authorIsBot: boolean;
	isSelfReaction: boolean;
}): boolean => {
	return !authorIsBot && !isSelfReaction;
};
