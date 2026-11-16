import { shouldSeedWeekResolution } from "../betting/resolution-utils";
import { all, get, normalizeId, run } from "./index";
export {
	getPreviousWeekEnd,
	getPreviousWeekRange,
	getPreviousWeekStart,
	getWeekEnd,
	getWeekStart,
} from "../betting/week-utils";
export {
	DAY_MULTIPLIERS,
	METRIC_CUTOFFS,
	canBetOnMetric,
	getCurrentMultiplier,
	getDayNumber,
	getMultiplierForDay,
} from "../betting/odds-utils";

// Types
export interface BettingLine {
	id: number;
	server_id: string;
	target_user_id: string;
	metric: string;
	line_value: number;
	week_start: string;
	created_at: string;
}

export interface Bet {
	id: number;
	server_id: string;
	line_id: number;
	bettor_user_id: string;
	direction: "over" | "under";
	amount: number;
	multiplier: number;
	placed_at: string;
	resolved: number;
	won: number | null;
	payout: number | null;
}

export interface BettingHistory {
	id: number;
	server_id: string;
	week_start: string;
	target_user_id: string;
	metric: string;
	line_value: number;
	actual_value: number;
	winning_direction: string;
	total_wagered: number;
	total_paid_out: number;
	created_at: string;
}

export type BettingMetric =
	| "messages"
	| "xp"
	| "voice_minutes"
	| "streak_days"
	| "leaderboard_position";

// Betting Lines CRUD
export const getBettingLine = ({
	serverId,
	targetUserId,
	metric,
	weekStart,
}: {
	serverId: string;
	targetUserId: string;
	metric: BettingMetric;
	weekStart: string;
}): BettingLine | undefined => {
	return get<BettingLine>(
		`SELECT * FROM betting_lines
		WHERE server_id = ?1 AND target_user_id = ?2 AND metric = ?3 AND week_start = ?4`,
		[normalizeId(serverId), normalizeId(targetUserId), metric, weekStart],
	);
};

export const createBettingLine = ({
	serverId,
	targetUserId,
	metric,
	lineValue,
	weekStart,
}: {
	serverId: string;
	targetUserId: string;
	metric: BettingMetric;
	lineValue: number;
	weekStart: string;
}): number => {
	const result = run(
		`INSERT INTO betting_lines (server_id, target_user_id, metric, line_value, week_start)
		VALUES (?1, ?2, ?3, ?4, ?5)`,
		[normalizeId(serverId), normalizeId(targetUserId), metric, lineValue, weekStart],
	);
	return Number(result.lastInsertRowid);
};

export const getOrCreateBettingLine = ({
	serverId,
	targetUserId,
	metric,
	lineValue,
	weekStart,
}: {
	serverId: string;
	targetUserId: string;
	metric: BettingMetric;
	lineValue: number;
	weekStart: string;
}): BettingLine => {
	const existing = getBettingLine({ serverId, targetUserId, metric, weekStart });
	if (existing) return existing;

	createBettingLine({
		serverId,
		targetUserId,
		metric,
		lineValue,
		weekStart,
	});
	return getBettingLine({ serverId, targetUserId, metric, weekStart })!;
};

export const getActiveLinesForServer = ({
	serverId,
	weekStart,
}: {
	serverId: string;
	weekStart: string;
}): BettingLine[] => {
	return all<BettingLine>("SELECT * FROM betting_lines WHERE server_id = ?1 AND week_start = ?2", [
		normalizeId(serverId),
		weekStart,
	]);
};

export const getLinesForUser = ({
	serverId,
	targetUserId,
	weekStart,
}: {
	serverId: string;
	targetUserId: string;
	weekStart: string;
}): BettingLine[] => {
	return all<BettingLine>(
		`SELECT * FROM betting_lines
		WHERE server_id = ?1 AND target_user_id = ?2 AND week_start = ?3`,
		[normalizeId(serverId), normalizeId(targetUserId), weekStart],
	);
};

// Bets CRUD
export const placeBet = ({
	serverId,
	lineId,
	bettorUserId,
	direction,
	amount,
	multiplier,
}: {
	serverId: string;
	lineId: number;
	bettorUserId: string;
	direction: "over" | "under";
	amount: number;
	multiplier: number;
}): number => {
	const result = run(
		`INSERT INTO bets (server_id, line_id, bettor_user_id, direction, amount, multiplier)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
		[normalizeId(serverId), lineId, normalizeId(bettorUserId), direction, amount, multiplier],
	);
	return Number(result.lastInsertRowid);
};

export const getBet = ({ betId }: { betId: number }): Bet | undefined => {
	return get<Bet>("SELECT * FROM bets WHERE id = ?1", [betId]);
};

export const getUserBets = ({
	serverId,
	userId,
	unresolvedOnly = false,
}: {
	serverId: string;
	userId: string;
	unresolvedOnly?: boolean;
}): Bet[] => {
	if (unresolvedOnly) {
		return all<Bet>(
			"SELECT * FROM bets WHERE server_id = ?1 AND bettor_user_id = ?2 AND resolved = 0",
			[normalizeId(serverId), normalizeId(userId)],
		);
	}
	return all<Bet>("SELECT * FROM bets WHERE server_id = ?1 AND bettor_user_id = ?2", [
		normalizeId(serverId),
		normalizeId(userId),
	]);
};

export const getBetsOnLine = ({ lineId }: { lineId: number }): Bet[] => {
	return all<Bet>("SELECT * FROM bets WHERE line_id = ?1", [lineId]);
};

export const getUnresolvedBetsForWeek = ({
	serverId,
	weekStart,
}: {
	serverId: string;
	weekStart: string;
}): (Bet & { line: BettingLine })[] => {
	return all<Bet & { line: BettingLine }>(
		`SELECT b.*, bl.server_id as line_server_id, bl.target_user_id, bl.metric, bl.line_value, bl.week_start as line_week_start
		FROM bets b
		JOIN betting_lines bl ON b.line_id = bl.id
		WHERE b.server_id = ?1 AND bl.week_start = ?2 AND b.resolved = 0`,
		[normalizeId(serverId), weekStart],
	);
};

export const resolveBet = ({
	betId,
	won,
	payout,
}: {
	betId: number;
	won: boolean;
	payout: number;
}): void => {
	run("UPDATE bets SET resolved = 1, won = ?2, payout = ?3 WHERE id = ?1", [
		betId,
		won ? 1 : 0,
		payout,
	]);
};

export const voidBet = ({ betId }: { betId: number }): void => {
	run("DELETE FROM bets WHERE id = ?1", [betId]);
};

// Bet counts (for visibility - doesn't reveal direction)
export const getBetCountOnUser = ({
	serverId,
	targetUserId,
	weekStart,
}: {
	serverId: string;
	targetUserId: string;
	weekStart: string;
}): { metric: string; count: number }[] => {
	return all<{ metric: string; count: number }>(
		`SELECT bl.metric, COUNT(b.id) as count
		FROM betting_lines bl
		LEFT JOIN bets b ON bl.id = b.line_id AND b.resolved = 0
		WHERE bl.server_id = ?1 AND bl.target_user_id = ?2 AND bl.week_start = ?3
		GROUP BY bl.metric`,
		[normalizeId(serverId), normalizeId(targetUserId), weekStart],
	);
};

export const getTotalBetCountOnUser = ({
	serverId,
	targetUserId,
	weekStart,
}: {
	serverId: string;
	targetUserId: string;
	weekStart: string;
}): number => {
	const result = get<{ count: number }>(
		`SELECT COUNT(b.id) as count
		FROM bets b
		JOIN betting_lines bl ON b.line_id = bl.id
		WHERE bl.server_id = ?1 AND bl.target_user_id = ?2 AND bl.week_start = ?3 AND b.resolved = 0`,
		[normalizeId(serverId), normalizeId(targetUserId), weekStart],
	);
	return result?.count ?? 0;
};

// Betting History
export const addBettingHistory = ({
	serverId,
	weekStart,
	targetUserId,
	metric,
	lineValue,
	actualValue,
	winningDirection,
	totalWagered,
	totalPaidOut,
}: {
	serverId: string;
	weekStart: string;
	targetUserId: string;
	metric: string;
	lineValue: number;
	actualValue: number;
	winningDirection: string;
	totalWagered: number;
	totalPaidOut: number;
}): void => {
	run(
		`INSERT INTO betting_history
		(server_id, week_start, target_user_id, metric, line_value, actual_value, winning_direction, total_wagered, total_paid_out)
		VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
		[
			normalizeId(serverId),
			weekStart,
			normalizeId(targetUserId),
			metric,
			lineValue,
			actualValue,
			winningDirection,
			totalWagered,
			totalPaidOut,
		],
	);
};

export const getBettingHistoryForWeek = ({
	serverId,
	weekStart,
}: {
	serverId: string;
	weekStart: string;
}): BettingHistory[] => {
	return all<BettingHistory>(
		"SELECT * FROM betting_history WHERE server_id = ?1 AND week_start = ?2",
		[normalizeId(serverId), weekStart],
	);
};

// Resolution tracking
export const hasWeekBeenResolved = ({
	serverId,
	weekStart,
}: {
	serverId: string;
	weekStart: string;
}): boolean => {
	const result = get<{ server_id: string }>(
		"SELECT server_id FROM betting_resolution_runs WHERE server_id = ?1 AND week_start = ?2",
		[normalizeId(serverId), weekStart],
	);
	return result !== undefined;
};

export const markWeekResolved = ({
	serverId,
	weekStart,
}: {
	serverId: string;
	weekStart: string;
}): void => {
	const now = new Date().toISOString();
	run(
		"INSERT OR IGNORE INTO betting_resolution_runs (server_id, week_start, resolved_at) VALUES (?1, ?2, ?3)",
		[normalizeId(serverId), weekStart, now],
	);
};

export const seedWeekResolutionFromHistory = ({
	serverId,
	weekStart,
}: {
	serverId: string;
	weekStart: string;
}): boolean => {
	const result = get<{ count: number }>(
		"SELECT COUNT(1) as count FROM betting_history WHERE server_id = ?1 AND week_start = ?2",
		[normalizeId(serverId), weekStart],
	);

	const unresolved = get<{ count: number }>(
		`SELECT COUNT(1) as count
		FROM bets b
		INNER JOIN betting_lines l ON l.id = b.line_id
		WHERE l.server_id = ?1 AND l.week_start = ?2 AND b.resolved = 0`,
		[normalizeId(serverId), weekStart],
	);

	if (
		shouldSeedWeekResolution({
			historyCount: result?.count ?? 0,
			unresolvedCount: unresolved?.count ?? 0,
		})
	) {
		markWeekResolved({ serverId, weekStart });
		return true;
	}

	return false;
};
