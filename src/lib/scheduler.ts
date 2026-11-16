import chalk from "chalk";
import type { Client, Guild } from "discord.js";
import { resolveWeeklyBets, sendWeeklyReveal } from "./betting/resolution";
import {
	getPreviousWeekEnd,
	getPreviousWeekStart,
	hasWeekBeenResolved,
	markWeekResolved,
	seedWeekResolutionFromHistory,
} from "./db/betting";

// Check interval - every hour
const CHECK_INTERVAL = 60 * 60 * 1000;

// Initialize the betting resolution scheduler
export const initBettingScheduler = (client: Client) => {
	console.log(chalk.cyan("[Scheduler] Betting resolution scheduler initialized"));

	// Check immediately on startup
	void checkAndRunResolution(client);

	// Then check every hour
	setInterval(() => {
		void checkAndRunResolution(client);
	}, CHECK_INTERVAL);
};

// Check if we should run the weekly resolution
const checkAndRunResolution = async (client: Client) => {
	const previousWeekStart = getPreviousWeekStart();

	for (const guild of client.guilds.cache.values()) {
		try {
			// Check if this week has already been resolved for this guild
			if (hasWeekBeenResolved({ serverId: guild.id, weekStart: previousWeekStart })) {
				continue;
			}

			if (
				seedWeekResolutionFromHistory({
					serverId: guild.id,
					weekStart: previousWeekStart,
				})
			) {
				continue;
			}

			console.log(
				chalk.yellow(
					`[Scheduler] Running betting resolution for ${guild.name} (week: ${previousWeekStart})...`,
				),
			);

			await resolveForGuild(guild, previousWeekStart);
		} catch (error) {
			console.error(chalk.red(`[Scheduler] Error checking resolution for ${guild.name}:`), error);
		}
	}
};

// Resolve bets for a specific guild
const resolveForGuild = async (guild: Guild, weekStart: string) => {
	const weekEnd = getPreviousWeekEnd(weekStart);

	try {
		const results = await resolveWeeklyBets({
			serverId: guild.id,
			previousWeekStart: weekStart,
			previousWeekEnd: weekEnd,
		});

		// Mark the week as resolved (even if no bets) to prevent re-running
		markWeekResolved({ serverId: guild.id, weekStart });

		if (results.length > 0) {
			console.log(
				chalk.green(`[Scheduler] Resolved ${results.length} betting lines for ${guild.name}`),
			);

			// Send the reveal
			await sendWeeklyReveal({ guild, results });
		} else {
			console.log(chalk.gray(`[Scheduler] No bets to resolve for ${guild.name}`));
		}
	} catch (error) {
		console.error(chalk.red(`[Scheduler] Error resolving bets for ${guild.name}:`), error);
	}
};

// Manual trigger for testing
export const triggerManualResolution = async (client: Client) => {
	console.log(chalk.yellow("[Scheduler] Manual resolution triggered"));
	const previousWeekStart = getPreviousWeekStart();

	for (const guild of client.guilds.cache.values()) {
		await resolveForGuild(guild, previousWeekStart);
	}

	console.log(chalk.green("[Scheduler] Manual resolution complete!"));
};
