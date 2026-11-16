import chalk from "chalk";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { ActivityType, Client, Events } from "discord.js";
import { AGENT_USER_ID, IS_DEV } from "../lib/constants";
import { DEBUG, FEATURE_BETTING } from "../lib/constants/flags";
import { reportEventError } from "./util";

dayjs.extend(utc);
dayjs.extend(timezone);
import { createServer } from "../lib/db/guild";
import { scheduleReminders } from "../lib/db/reminders";
import { initBettingScheduler } from "../lib/scheduler";
import { getServerProperties } from "../lib/util";

const STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

async function setBotStatus(client: Client) {
	try {
		client.user?.setActivity("Monitoring", { type: ActivityType.Custom });
		return true;
	} catch (error) {
		reportEventError("statusCheck", error, { phase: "setActivity" }, "warning");
		return false;
	}
}

function startStatusMonitor(client: Client) {
	setInterval(async () => {
		try {
			const currentActivity = client.user?.presence?.activities?.[0];
			if (!currentActivity || currentActivity.name !== "Monitoring") {
				console.log(chalk.yellow("[Status Monitor] Status missing or changed, restoring..."));
				await setBotStatus(client);
			}
		} catch (error) {
			reportEventError("statusMonitor", error, {}, "warning");
		}
	}, STATUS_CHECK_INTERVAL);
}

function logReadyMessage(client: Client) {
	let formattedDate;
	const targetTimezone = "America/New_York";
	if (IS_DEV) {
		// For dev, show local time with timezone abbreviation for clarity
		formattedDate = dayjs().format("MMM D, YYYY h:mm A");
	} else {
		// For prod, show New York time with timezone abbreviation
		formattedDate = dayjs().tz(targetTimezone).format("MMM D, YYYY h:mm A");
	}
	const dateOutput = chalk.green(formattedDate);
	// const readyText = chalk.yellow("Ready!");
	const loggedInAs = chalk.blue(`${client.user!.tag}`);
	const message = `${dateOutput}\n${loggedInAs}\n\n   /\\_/\\ \n  ( o.o )\n   > ^ <\n`;
	console.log(message);
}

export const ready = {
	name: Events.ClientReady,
	once: true,
	async execute(client: Client) {
		try {
			logReadyMessage(client);

			if (client.user && client.user.id !== AGENT_USER_ID) {
				// Mention detection and reply logic compare against AGENT_USER_ID.
				reportEventError(
					"ready",
					new Error(
						`Bot user ID ${client.user.id} does not match AGENT_USER_ID "${AGENT_USER_ID}". Set AGENT_USER_ID or fix CLIENT_ID/DEV_CLIENT_ID.`,
					),
					{ phase: "agentUserIdCheck" },
					"error",
				);
			}

			if (DEBUG) {
				console.log(
					chalk.cyan(
						`Processing ${client.guilds.cache.size} guilds to ensure server records exist...`,
					),
				);
			}

			for (const guild of client.guilds.cache.values()) {
				try {
					const serverProperties = getServerProperties({ server: guild });

					const { success, exists } = await createServer(serverProperties, false);

					if (DEBUG) {
						if (!exists && success) {
							console.log(
								chalk.green(`  Server record for ${guild.name} (${guild.id}) created silently.`),
							);
						} else if (exists && success) {
							console.log(
								chalk.magenta(`  Server record for ${guild.name} (${guild.id}) already exists.`),
							);
						} else if (!success) {
							console.error(
								chalk.red(
									`  Failed to create or update server record for ${guild.name} (${guild.id}).`,
								),
							);
						}
					}
				} catch (error) {
					reportEventError(
						"ready",
						error,
						{ phase: "createServer", guildId: guild.id, guildName: guild.name },
						"warning",
					);
				}
			}
			if (DEBUG) {
				console.log(chalk.cyan("Finished ensuring server records."));
			}

			try {
				await scheduleReminders();
			} catch (error) {
				reportEventError("ready", error, { phase: "scheduleReminders" }, "error");
			}

			console.log(chalk.yellow("Ready!"));

			// Initialize betting scheduler
			if (FEATURE_BETTING) {
				try {
					initBettingScheduler(client);
				} catch (error) {
					reportEventError("ready", error, { phase: "initBettingScheduler" }, "error");
				}
			}

			await setBotStatus(client);

			// Start periodic status monitoring
			startStatusMonitor(client);
		} catch (error) {
			reportEventError("ready", error);
		}
	},
};
