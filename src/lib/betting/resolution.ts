import type { Guild, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import {
	type Bet,
	type BettingLine,
	type BettingMetric,
	addBettingHistory,
	getActiveLinesForServer,
	getBetsOnLine,
	resolveBet,
} from "../db/betting";
import { getEconomyConfig, updateUserCoins } from "../db/economy";
import { formatLine } from "./lines";
import { getMetricDisplayName, getMetricValue } from "./metrics";
import { getWinningDirection } from "./resolution-utils";
export { getPreviousWeekRange } from "./week-utils";

interface ResolutionResult {
	line: BettingLine;
	actualValue: number;
	winningDirection: "over" | "under" | "push";
	bets: {
		bet: Bet;
		won: boolean;
		payout: number;
	}[];
	totalWagered: number;
	totalPaidOut: number;
}

// Resolve all bets for a server for the previous week
export const resolveWeeklyBets = async ({
	serverId,
	previousWeekStart,
	previousWeekEnd,
}: {
	serverId: string;
	previousWeekStart: string;
	previousWeekEnd: string;
}): Promise<ResolutionResult[]> => {
	const results: ResolutionResult[] = [];

	// Get all lines for the previous week
	const lines = getActiveLinesForServer({
		serverId,
		weekStart: previousWeekStart,
	});

	for (const line of lines) {
		const actualValue = getMetricValue({
			serverId,
			userId: line.target_user_id,
			metric: line.metric as BettingMetric,
			weekStart: previousWeekStart,
			weekEnd: previousWeekEnd,
		});

		const winningDirection = getWinningDirection({
			actualValue,
			lineValue: line.line_value,
		});

		// Get all bets on this line
		const bets = getBetsOnLine({ lineId: line.id });
		const betResults: ResolutionResult["bets"] = [];
		let totalWagered = 0;
		let totalPaidOut = 0;

		for (const bet of bets) {
			if (bet.resolved) continue;

			totalWagered += bet.amount;

			let won = false;
			let payout = 0;

			if (winningDirection === "push") {
				// Return original bet
				payout = bet.amount;
				updateUserCoins({
					serverId,
					userId: bet.bettor_user_id,
					amount: payout,
					trackTotal: false,
				});
			} else if (bet.direction === winningDirection) {
				// Winner!
				won = true;
				payout = Math.floor(bet.amount * bet.multiplier);
				updateUserCoins({
					serverId,
					userId: bet.bettor_user_id,
					amount: payout,
					trackTotal: true,
				});
				totalPaidOut += payout;
			}
			// Losers get nothing - bet was already deducted

			resolveBet({ betId: bet.id, won, payout });
			betResults.push({ bet, won, payout });
		}

		// Record in history
		addBettingHistory({
			serverId,
			weekStart: previousWeekStart,
			targetUserId: line.target_user_id,
			metric: line.metric,
			lineValue: line.line_value,
			actualValue,
			winningDirection,
			totalWagered,
			totalPaidOut,
		});

		results.push({
			line,
			actualValue,
			winningDirection,
			bets: betResults,
			totalWagered,
			totalPaidOut,
		});
	}

	return results;
};

// Build the weekly reveal embed
export const buildRevealEmbed = ({
	results,
	guild: _guild,
}: {
	results: ResolutionResult[];
	guild: Guild;
}): EmbedBuilder => {
	const embed = new EmbedBuilder()
		.setColor(0xffd700)
		.setTitle("Weekly Betting Results")
		.setDescription("The bets are in! Here's how everyone did this week:")
		.setTimestamp();

	// Group results by target user
	const byUser = new Map<string, ResolutionResult[]>();
	for (const result of results) {
		const userId = result.line.target_user_id;
		if (!byUser.has(userId)) {
			byUser.set(userId, []);
		}
		byUser.get(userId)!.push(result);
	}

	// Build fields for each user with bets
	for (const [userId, userResults] of byUser) {
		const lines: string[] = [];

		for (const result of userResults) {
			if (result.bets.length === 0) continue;

			const metric = result.line.metric as BettingMetric;
			const metricName = getMetricDisplayName(metric);
			const lineDisplay = formatLine({
				metric,
				lineValue: result.line.line_value,
			});

			const resultEmoji =
				result.winningDirection === "over"
					? "📈"
					: result.winningDirection === "under"
						? "📉"
						: "➡️";

			lines.push(`${resultEmoji} **${metricName}**: ${result.actualValue} (line: ${lineDisplay})`);

			// Show winners
			const winners = result.bets.filter((b) => b.won);
			const losers = result.bets.filter((b) => !b.won && result.winningDirection !== "push");

			if (winners.length > 0) {
				const winnerList = winners
					.map((w) => `<@${w.bet.bettor_user_id}> won ${w.payout.toLocaleString()}`)
					.join(", ");
				lines.push(`  Winners: ${winnerList}`);
			}

			if (losers.length > 0) {
				const loserList = losers
					.map((l) => `<@${l.bet.bettor_user_id}> lost ${l.bet.amount.toLocaleString()}`)
					.join(", ");
				lines.push(`  Losers: ${loserList}`);
			}
		}

		if (lines.length > 0) {
			embed.addFields({
				name: `Bets on <@${userId}>`,
				value: lines.join("\n"),
				inline: false,
			});
		}
	}

	// Summary stats
	const totalWagered = results.reduce((sum, r) => sum + r.totalWagered, 0);
	const totalPaidOut = results.reduce((sum, r) => sum + r.totalPaidOut, 0);
	const houseDiff = totalWagered - totalPaidOut;

	embed.addFields({
		name: "Summary",
		value: [
			`Total wagered: ${totalWagered.toLocaleString()} coins`,
			`Total paid out: ${totalPaidOut.toLocaleString()} coins`,
			houseDiff >= 0
				? `House profit: ${houseDiff.toLocaleString()} coins`
				: `House loss: ${Math.abs(houseDiff).toLocaleString()} coins`,
		].join("\n"),
		inline: false,
	});

	return embed;
};

// Send the weekly reveal to a channel
export const sendWeeklyReveal = async ({
	guild,
	results,
}: {
	guild: Guild;
	results: ResolutionResult[];
}): Promise<void> => {
	const config = getEconomyConfig({ serverId: guild.id });

	// Find a channel to post to (levelup channel or first text channel)
	let channelId = config.levelup_channel_id;
	if (!channelId) {
		// Try to find a general channel
		const general = guild.channels.cache.find(
			(c) =>
				c.isTextBased() &&
				(c.name.includes("general") || c.name.includes("chat") || c.name.includes("bot")),
		);
		if (general) channelId = general.id;
	}

	if (!channelId) return;

	try {
		const channel = await guild.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) return;

		const embed = buildRevealEmbed({ results, guild });
		await (channel as TextChannel).send({ embeds: [embed] });
	} catch (error) {
		console.error("Failed to send weekly reveal:", error);
	}
};
