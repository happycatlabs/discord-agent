import { all, get, normalizeId, run } from "./index";

// Types
export interface UserEconomy {
	server_id: string;
	user_id: string;
	xp: number;
	level: number;
	coins: number;
	total_coins_earned: number;
	last_xp_at: string | null;
	last_daily_at: string | null;
	daily_streak: number;
	profile_private: number;
	created_at: string;
}

export interface EconomyConfig {
	server_id: string;
	enabled: number;
	xp_min: number;
	xp_max: number;
	xp_cooldown_seconds: number;
	daily_coins_min: number;
	daily_coins_max: number;
	daily_xp_min: number;
	daily_xp_max: number;
	levelup_channel_id: string | null;
	leaderboard_channel_id: string | null;
	casino_channel_id: string | null;
	min_bet: number;
	max_bet: number;
}

export interface LevelReward {
	server_id: string;
	level: number;
	role_id: string;
}

// Default config values
const DEFAULT_CONFIG: Omit<EconomyConfig, "server_id"> = {
	enabled: 1,
	xp_min: 15,
	xp_max: 25,
	xp_cooldown_seconds: 60,
	daily_coins_min: 100,
	daily_coins_max: 500,
	daily_xp_min: 50,
	daily_xp_max: 150,
	levelup_channel_id: null,
	leaderboard_channel_id: null,
	casino_channel_id: null,
	min_bet: 50,
	max_bet: 10000,
};

// User Economy CRUD
export const getUserEconomy = ({
	serverId,
	userId,
}: {
	serverId: string;
	userId: string;
}): UserEconomy | undefined => {
	return get<UserEconomy>("SELECT * FROM user_economy WHERE server_id = ?1 AND user_id = ?2", [
		normalizeId(serverId),
		normalizeId(userId),
	]);
};

export const getOrCreateUserEconomy = ({
	serverId,
	userId,
}: {
	serverId: string;
	userId: string;
}): UserEconomy => {
	const existing = getUserEconomy({ serverId, userId });
	if (existing) return existing;

	run("INSERT INTO user_economy (server_id, user_id) VALUES (?1, ?2)", [
		normalizeId(serverId),
		normalizeId(userId),
	]);

	return getUserEconomy({ serverId, userId })!;
};

export const updateUserXP = ({
	serverId,
	userId,
	xpGain,
	newLevel,
	updateLastXpAt = true,
}: {
	serverId: string;
	userId: string;
	xpGain: number;
	newLevel?: number;
	updateLastXpAt?: boolean;
}): void => {
	const now = new Date().toISOString();
	if (newLevel !== undefined) {
		if (updateLastXpAt) {
			run(
				`UPDATE user_economy
				SET xp = xp + ?3, level = ?4, last_xp_at = ?5
				WHERE server_id = ?1 AND user_id = ?2`,
				[normalizeId(serverId), normalizeId(userId), xpGain, newLevel, now],
			);
		} else {
			run(
				`UPDATE user_economy
				SET xp = xp + ?3, level = ?4
				WHERE server_id = ?1 AND user_id = ?2`,
				[normalizeId(serverId), normalizeId(userId), xpGain, newLevel],
			);
		}
	} else {
		if (updateLastXpAt) {
			run(
				`UPDATE user_economy
				SET xp = xp + ?3, last_xp_at = ?4
				WHERE server_id = ?1 AND user_id = ?2`,
				[normalizeId(serverId), normalizeId(userId), xpGain, now],
			);
		} else {
			run(
				`UPDATE user_economy
				SET xp = xp + ?3
				WHERE server_id = ?1 AND user_id = ?2`,
				[normalizeId(serverId), normalizeId(userId), xpGain],
			);
		}
	}
};

export const updateUserCoins = ({
	serverId,
	userId,
	amount,
	trackTotal = true,
}: {
	serverId: string;
	userId: string;
	amount: number;
	trackTotal?: boolean;
}): void => {
	if (trackTotal && amount > 0) {
		run(
			`UPDATE user_economy
			SET coins = coins + ?3, total_coins_earned = total_coins_earned + ?3
			WHERE server_id = ?1 AND user_id = ?2`,
			[normalizeId(serverId), normalizeId(userId), amount],
		);
	} else {
		run(
			`UPDATE user_economy
			SET coins = coins + ?3
			WHERE server_id = ?1 AND user_id = ?2`,
			[normalizeId(serverId), normalizeId(userId), amount],
		);
	}
};

export const setUserCoins = ({
	serverId,
	userId,
	coins,
}: {
	serverId: string;
	userId: string;
	coins: number;
}): void => {
	run("UPDATE user_economy SET coins = ?3 WHERE server_id = ?1 AND user_id = ?2", [
		normalizeId(serverId),
		normalizeId(userId),
		coins,
	]);
};

export const setUserLevel = ({
	serverId,
	userId,
	level,
	xp,
}: {
	serverId: string;
	userId: string;
	level: number;
	xp: number;
}): void => {
	run("UPDATE user_economy SET level = ?3, xp = ?4 WHERE server_id = ?1 AND user_id = ?2", [
		normalizeId(serverId),
		normalizeId(userId),
		level,
		xp,
	]);
};

export const updateDailyStreak = ({
	serverId,
	userId,
	streak,
}: {
	serverId: string;
	userId: string;
	streak: number;
}): void => {
	const now = new Date().toISOString();
	run(
		`UPDATE user_economy
		SET daily_streak = ?3, last_daily_at = ?4
		WHERE server_id = ?1 AND user_id = ?2`,
		[normalizeId(serverId), normalizeId(userId), streak, now],
	);
};

export const claimDaily = ({
	serverId,
	userId,
	newStreak,
}: {
	serverId: string;
	userId: string;
	newStreak: number;
}): void => {
	const now = new Date().toISOString();
	run(
		`UPDATE user_economy
		SET daily_streak = ?3, last_daily_at = ?4
		WHERE server_id = ?1 AND user_id = ?2`,
		[normalizeId(serverId), normalizeId(userId), newStreak, now],
	);
};

// Reaction XP deduping (one award per message per reacting user)
export const recordReactionXpAward = ({
	serverId,
	messageId,
	reactorUserId,
	authorUserId,
}: {
	serverId: string;
	messageId: string;
	reactorUserId: string;
	authorUserId: string;
}): boolean => {
	const result = run(
		`INSERT OR IGNORE INTO reaction_xp_awards
		(server_id, message_id, reactor_user_id, author_user_id)
		VALUES (?1, ?2, ?3, ?4)`,
		[
			normalizeId(serverId),
			normalizeId(messageId),
			normalizeId(reactorUserId),
			normalizeId(authorUserId),
		],
	);

	const changes = (result as { changes?: number }).changes ?? 0;
	return changes > 0;
};

// Leaderboards
export const getLeaderboard = ({
	serverId,
	limit = 10,
	offset = 0,
	sortBy = "xp",
}: {
	serverId: string;
	limit?: number;
	offset?: number;
	sortBy?: "xp" | "level" | "coins";
}): UserEconomy[] => {
	const orderColumn = sortBy === "coins" ? "coins" : sortBy === "level" ? "level" : "xp";
	const filterClause = sortBy === "coins" ? "AND coins > 0" : sortBy === "xp" ? "AND xp > 0" : "";
	return all<UserEconomy>(
		`SELECT * FROM user_economy
		WHERE server_id = ?1
		${filterClause}
		ORDER BY ${orderColumn} DESC
		LIMIT ?2 OFFSET ?3`,
		[normalizeId(serverId), limit, offset],
	);
};

export const getUserRank = ({ serverId, userId }: { serverId: string; userId: string }): number => {
	const result = get<{ rank: number }>(
		`SELECT COUNT(*) + 1 as rank FROM user_economy
		WHERE server_id = ?1 AND xp > (
			SELECT xp FROM user_economy WHERE server_id = ?1 AND user_id = ?2
		)`,
		[normalizeId(serverId), normalizeId(userId)],
	);
	return result?.rank ?? 0;
};

// Economy Config
export const getEconomyConfig = ({ serverId }: { serverId: string }): EconomyConfig => {
	const config = get<EconomyConfig>("SELECT * FROM economy_config WHERE server_id = ?1", [
		normalizeId(serverId),
	]);

	if (config) return config;

	// Return defaults if no config exists
	return {
		server_id: normalizeId(serverId),
		...DEFAULT_CONFIG,
	};
};

export const updateEconomyConfig = ({
	serverId,
	updates,
}: {
	serverId: string;
	updates: Partial<Omit<EconomyConfig, "server_id">>;
}): void => {
	const existing = get<EconomyConfig>("SELECT * FROM economy_config WHERE server_id = ?1", [
		normalizeId(serverId),
	]);

	if (!existing) {
		// Insert new config with defaults
		run(
			`INSERT INTO economy_config (
				server_id, enabled, xp_min, xp_max, xp_cooldown_seconds,
				daily_coins_min, daily_coins_max, daily_xp_min, daily_xp_max,
				levelup_channel_id, leaderboard_channel_id, casino_channel_id, min_bet, max_bet
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
			[
				normalizeId(serverId),
				updates.enabled ?? DEFAULT_CONFIG.enabled,
				updates.xp_min ?? DEFAULT_CONFIG.xp_min,
				updates.xp_max ?? DEFAULT_CONFIG.xp_max,
				updates.xp_cooldown_seconds ?? DEFAULT_CONFIG.xp_cooldown_seconds,
				updates.daily_coins_min ?? DEFAULT_CONFIG.daily_coins_min,
				updates.daily_coins_max ?? DEFAULT_CONFIG.daily_coins_max,
				updates.daily_xp_min ?? DEFAULT_CONFIG.daily_xp_min,
				updates.daily_xp_max ?? DEFAULT_CONFIG.daily_xp_max,
				updates.levelup_channel_id ?? DEFAULT_CONFIG.levelup_channel_id,
				updates.leaderboard_channel_id ?? DEFAULT_CONFIG.leaderboard_channel_id,
				updates.casino_channel_id ?? DEFAULT_CONFIG.casino_channel_id,
				updates.min_bet ?? DEFAULT_CONFIG.min_bet,
				updates.max_bet ?? DEFAULT_CONFIG.max_bet,
			],
		);
	} else {
		// Update existing
		const fields: string[] = [];
		const values: unknown[] = [normalizeId(serverId)];
		let paramIndex = 2;

		for (const [key, value] of Object.entries(updates)) {
			if (value !== undefined) {
				fields.push(`${key} = ?${paramIndex}`);
				values.push(value);
				paramIndex++;
			}
		}

		if (fields.length > 0) {
			run(`UPDATE economy_config SET ${fields.join(", ")} WHERE server_id = ?1`, values);
		}
	}
};

// Level Rewards
export const getLevelRewards = ({ serverId }: { serverId: string }): LevelReward[] => {
	return all<LevelReward>("SELECT * FROM level_rewards WHERE server_id = ?1 ORDER BY level ASC", [
		normalizeId(serverId),
	]);
};

export const getLevelReward = ({
	serverId,
	level,
}: {
	serverId: string;
	level: number;
}): LevelReward | undefined => {
	return get<LevelReward>("SELECT * FROM level_rewards WHERE server_id = ?1 AND level = ?2", [
		normalizeId(serverId),
		level,
	]);
};

export const setLevelReward = ({
	serverId,
	level,
	roleId,
}: {
	serverId: string;
	level: number;
	roleId: string;
}): void => {
	run(
		`INSERT OR REPLACE INTO level_rewards (server_id, level, role_id)
		VALUES (?1, ?2, ?3)`,
		[normalizeId(serverId), level, normalizeId(roleId)],
	);
};

export const removeLevelReward = ({
	serverId,
	level,
}: {
	serverId: string;
	level: number;
}): void => {
	run("DELETE FROM level_rewards WHERE server_id = ?1 AND level = ?2", [
		normalizeId(serverId),
		level,
	]);
};

// Weekly Stats (for betting)
export const getWeeklyXP = ({
	serverId: _serverId,
	userId: _userId,
	weekStart: _weekStart,
}: {
	serverId: string;
	userId: string;
	weekStart: string;
}): number => {
	// This requires tracking XP gains over time, which we'll need to calculate
	// For now, we can estimate from message count in the messages table
	// TODO: Add xp_transactions table for accurate weekly XP tracking
	return 0;
};

export const getWeeklyMessageCount = ({
	serverId,
	userId,
	weekStart,
	weekEnd,
}: {
	serverId: string;
	userId: string;
	weekStart: string;
	weekEnd: string;
}): number => {
	const result = get<{ count: number }>(
		`SELECT COUNT(*) as count FROM messages
		WHERE server_id = ?1 AND author_id = ?2
		AND created_at >= ?3 AND created_at < ?4
		AND deleted = 0`,
		[normalizeId(serverId), normalizeId(userId), weekStart, weekEnd],
	);
	return result?.count ?? 0;
};

export const getWeeklyLeaderboardPosition = ({
	serverId,
	userId,
	weekStart,
	weekEnd,
}: {
	serverId: string;
	userId: string;
	weekStart: string;
	weekEnd: string;
}): number => {
	// Calculate position based on message count for now
	// TODO: Use XP when we have weekly XP tracking
	const result = get<{ position: number }>(
		`WITH weekly_activity AS (
			SELECT author_id, COUNT(*) as msg_count
			FROM messages
			WHERE server_id = ?1 AND created_at >= ?3 AND created_at < ?4 AND deleted = 0
			GROUP BY author_id
		)
		SELECT COUNT(*) + 1 as position FROM weekly_activity
		WHERE msg_count > (
			SELECT COALESCE(msg_count, 0) FROM weekly_activity WHERE author_id = ?2
		)`,
		[normalizeId(serverId), normalizeId(userId), weekStart, weekEnd],
	);
	return result?.position ?? 0;
};

// Profile Privacy
export const setProfilePrivate = ({
	serverId,
	userId,
	isPrivate,
}: {
	serverId: string;
	userId: string;
	isPrivate: boolean;
}): void => {
	run("UPDATE user_economy SET profile_private = ?3 WHERE server_id = ?1 AND user_id = ?2", [
		normalizeId(serverId),
		normalizeId(userId),
		isPrivate ? 1 : 0,
	]);
};
