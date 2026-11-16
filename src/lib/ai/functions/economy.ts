import { formatLine, getOrCalculateLine } from "../../betting/lines";
import { ALL_METRICS, getMetricDisplayName } from "../../betting/metrics";
import {
	getBetCountOnUser,
	getCurrentMultiplier,
	getUserBets,
	getWeekStart,
} from "../../db/betting";
import type { BettingMetric } from "../../db/betting";
import { getLeaderboard, getOrCreateUserEconomy, getUserRank } from "../../db/economy";
import { generateXpBar, xpProgressInLevel } from "../../economy/xp";

export enum EconomyFunction {
	GET_USER_RANK = "GET_USER_RANK",
	GET_LEADERBOARD = "GET_LEADERBOARD",
	GET_BETTING_ODDS = "GET_BETTING_ODDS",
	GET_BETS_ON_USER = "GET_BETS_ON_USER",
	GET_USER_BETS = "GET_USER_BETS",
	GET_BETTING_LINES = "GET_BETTING_LINES",
}

// Function definitions for AI
export const economyFunctions = [
	{
		type: "function",
		function: {
			name: EconomyFunction.GET_USER_RANK,
			description:
				"Get a user's level, XP, coins, and rank. Use for questions like 'What level am I?', 'How much XP do I have?', 'What's my rank?'",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID.",
						type: "string",
					},
					userId: {
						description: "The ID of the user to get rank for.",
						type: "string",
					},
				},
				required: ["serverId", "userId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: EconomyFunction.GET_LEADERBOARD,
			description:
				"Get the server XP leaderboard. Use for questions like 'Who is winning?', 'Show me the leaderboard', 'Who has the most XP?'",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID.",
						type: "string",
					},
					limit: {
						description: "Number of users to show (default 5).",
						type: "number",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: EconomyFunction.GET_BETTING_ODDS,
			description:
				"Get current betting multiplier and odds schedule. Use for questions like 'What are the odds today?', 'What's the current multiplier?'",
			parameters: {
				type: "object",
				properties: {},
				required: [],
			},
		},
	},
	{
		type: "function",
		function: {
			name: EconomyFunction.GET_BETS_ON_USER,
			description:
				"Get how many bets are placed on a specific user. Use for questions like 'What bets are on me?', 'How many people are betting on @user?'",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID.",
						type: "string",
					},
					userId: {
						description: "The ID of the user to check bets on.",
						type: "string",
					},
				},
				required: ["serverId", "userId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: EconomyFunction.GET_USER_BETS,
			description:
				"Get a user's active bets. Use for questions like 'What are my bets?', 'Show my active bets'",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID.",
						type: "string",
					},
					userId: {
						description: "The ID of the user to get bets for.",
						type: "string",
					},
				},
				required: ["serverId", "userId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: EconomyFunction.GET_BETTING_LINES,
			description:
				"Get betting lines for a specific user. Use for questions like 'What are the betting lines for @user?', 'Show me @user's lines'",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID.",
						type: "string",
					},
					userId: {
						description: "The ID of the user to get lines for.",
						type: "string",
					},
				},
				required: ["serverId", "userId"],
			},
		},
	},
];

// Function implementations
export const getUserRankInfo = ({ serverId, userId }: { serverId: string; userId: string }) => {
	const economy = getOrCreateUserEconomy({ serverId, userId });
	const rank = getUserRank({ serverId, userId });
	const progress = xpProgressInLevel(economy.xp, economy.level);
	const xpBar = generateXpBar(progress.percentage, 10);

	return {
		level: economy.level,
		xp: economy.xp,
		coins: economy.coins,
		rank: rank || "Unranked",
		totalCoinsEarned: economy.total_coins_earned,
		dailyStreak: economy.daily_streak,
		xpProgress: {
			current: progress.current,
			needed: progress.needed,
			percentage: progress.percentage,
			bar: xpBar,
		},
	};
};

export const getLeaderboardInfo = ({
	serverId,
	limit = 5,
}: {
	serverId: string;
	limit?: number;
}) => {
	const users = getLeaderboard({ serverId, limit });
	return users.map((user, index) => ({
		position: index + 1,
		userId: user.user_id,
		level: user.level,
		xp: user.xp,
		coins: user.coins,
	}));
};

export const getBettingOdds = () => {
	const multiplier = getCurrentMultiplier();
	const today = new Date().getUTCDay();
	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	return {
		today: dayNames[today],
		currentMultiplier: multiplier,
		schedule: {
			Sunday: 2.0,
			Monday: 1.8,
			Tuesday: 1.6,
			Wednesday: 1.4,
			Thursday: 1.25,
			Friday: 1.1,
			Saturday: 1.05,
		},
	};
};

export const getBetsOnUserInfo = ({ serverId, userId }: { serverId: string; userId: string }) => {
	const weekStart = getWeekStart();
	const betCounts = getBetCountOnUser({
		serverId,
		targetUserId: userId,
		weekStart,
	});

	return {
		totalBets: betCounts.reduce((sum, b) => sum + b.count, 0),
		byMetric: betCounts.map((b) => ({
			metric: getMetricDisplayName(b.metric as BettingMetric),
			count: b.count,
		})),
	};
};

export const getUserBetsInfo = ({ serverId, userId }: { serverId: string; userId: string }) => {
	const bets = getUserBets({ serverId, userId, unresolvedOnly: true });

	return bets.map((bet) => ({
		id: bet.id,
		amount: bet.amount,
		direction: bet.direction,
		multiplier: bet.multiplier,
		potentialPayout: Math.floor(bet.amount * bet.multiplier),
	}));
};

export const getBettingLinesInfo = ({ serverId, userId }: { serverId: string; userId: string }) => {
	const multiplier = getCurrentMultiplier();

	return ALL_METRICS.map((metric) => {
		const line = getOrCalculateLine({ serverId, userId, metric });
		return {
			metric: getMetricDisplayName(metric),
			line: formatLine({ metric, lineValue: line.line_value }),
			lineValue: line.line_value,
			currentMultiplier: multiplier,
		};
	});
};

// Map function names to implementations
export const ECONOMY_AVAILABLE_FUNCTIONS = {
	[EconomyFunction.GET_USER_RANK]: getUserRankInfo,
	[EconomyFunction.GET_LEADERBOARD]: getLeaderboardInfo,
	[EconomyFunction.GET_BETTING_ODDS]: getBettingOdds,
	[EconomyFunction.GET_BETS_ON_USER]: getBetsOnUserInfo,
	[EconomyFunction.GET_USER_BETS]: getUserBetsInfo,
	[EconomyFunction.GET_BETTING_LINES]: getBettingLinesInfo,
} satisfies Record<EconomyFunction, (params: never) => unknown>;
