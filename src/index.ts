require("dotenv").config();

import os from "node:os";
import * as Sentry from "@sentry/node";
import { Scope } from "@sentry/node";
import { Client, Collection, GatewayIntentBits, Options, Partials } from "discord.js";
import { commands } from "./commands";
import { events } from "./events";
import { AGENT_USER_ID, TOKEN } from "./lib/constants";
import { connect } from "./lib/db";

Sentry.init({
	dsn: process.env.SENTRY_DSN,
	environment: process.env.NODE_ENV || "production",
	release: process.env.SENTRY_RELEASE,
	sendDefaultPii: false,
	tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
	_experiments: { enableLogs: true },
});

type GenericEventExecute = (...args: unknown[]) => unknown;

function normalizeError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error("Unknown non-error rejection");
	}
}

function captureWithSentry(
	error: unknown,
	context: {
		origin: string;
		level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
		extra?: Record<string, unknown>;
	},
) {
	const normalized = normalizeError(error);
	Sentry.withScope((scope: Scope) => {
		scope.setTag("error.origin", context.origin);
		if (context.level) scope.setLevel(context.level);
		if (context.extra) scope.setContext("error.extra", context.extra);
		Sentry.captureException(normalized);
	});
	console.error(`[${context.origin}]`, error);
}

function wrapEventHandler(
	eventName: string,
	execute: GenericEventExecute,
): (...args: unknown[]) => Promise<void> {
	// Use a standard function (not arrow) so Discord.js binds the emitter as `this`
	return async function (this: unknown, ...args: unknown[]) {
		try {
			await Promise.resolve(execute.apply(this, args));
		} catch (error) {
			const extraContext: Record<string, unknown> = {
				argTypes: args.map((arg) =>
					arg && typeof arg === "object"
						? ((arg as { constructor?: { name?: string } })?.constructor?.name ?? "object")
						: typeof arg,
				),
			};

			// Safely extract context from first argument if it's an object
			const firstArg = args[0];
			if (firstArg && typeof firstArg === "object") {
				const obj = firstArg as Record<string, any>;
				if (typeof obj.id === "string") {
					extraContext.entityId = obj.id;
				}
				if (obj.channel && typeof obj.channel === "object" && obj.channel.id) {
					extraContext.channelId = obj.channel.id;
				}
				if (obj.guild && typeof obj.guild === "object" && obj.guild.id) {
					extraContext.guildId = obj.guild.id;
				}
			}

			captureWithSentry(error, {
				origin: `discord.event.${eventName}`,
				extra: extraContext,
			});
		}
	};
}

const CPU_WATCHDOG_INTERVAL_MS = Number(process.env.CPU_WATCHDOG_INTERVAL_MS ?? "60000");
const CPU_WATCHDOG_THRESHOLD = Number(process.env.CPU_WATCHDOG_THRESHOLD ?? "250");
const CPU_WATCHDOG_SUSTAINED_PERIODS = Number(process.env.CPU_WATCHDOG_SUSTAINED_PERIODS ?? "5");
const CPU_WATCHDOG_MEMORY_RSS_MB = Number(process.env.CPU_WATCHDOG_MEMORY_RSS_MB ?? "0");

if (
	CPU_WATCHDOG_INTERVAL_MS > 0 &&
	Number.isFinite(CPU_WATCHDOG_INTERVAL_MS) &&
	process.env.NODE_ENV !== "development"
) {
	startCpuWatchdog();
}

function startCpuWatchdog() {
	const totalCpus = Math.max(1, os.cpus().length);
	let lastUsage = process.cpuUsage();
	let lastHrtime = process.hrtime.bigint();
	let highCpuCount = 0;
	let triggered = false;

	const timer = setInterval(() => {
		const nowUsage = process.cpuUsage();
		const nowHrtime = process.hrtime.bigint();
		const userDiff = nowUsage.user - lastUsage.user;
		const systemDiff = nowUsage.system - lastUsage.system;
		const elapsedMicros = Number(nowHrtime - lastHrtime) / 1000;

		lastUsage = nowUsage;
		lastHrtime = nowHrtime;

		if (elapsedMicros <= 0) return;

		const cpuPercent = ((userDiff + systemDiff) / elapsedMicros / totalCpus) * 100;
		const rssMb = process.memoryUsage().rss / 1024 / 1024;

		if (cpuPercent >= CPU_WATCHDOG_THRESHOLD) {
			highCpuCount += 1;
		} else {
			highCpuCount = Math.max(0, highCpuCount - 1);
		}

		const overMemoryThreshold =
			CPU_WATCHDOG_MEMORY_RSS_MB > 0 && rssMb >= CPU_WATCHDOG_MEMORY_RSS_MB;

		if (triggered || (highCpuCount < CPU_WATCHDOG_SUSTAINED_PERIODS && !overMemoryThreshold))
			return;

		triggered = true;
		const reason = overMemoryThreshold
			? "memory"
			: `cpu >= ${CPU_WATCHDOG_THRESHOLD}% for ${highCpuCount} intervals`;
		captureWithSentry(new Error("Resource watchdog triggered"), {
			origin: "watchdog.cpu",
			extra: {
				cpuPercent: Number(cpuPercent.toFixed(2)),
				rssMb: Number(rssMb.toFixed(2)),
				thresholdCpuPercent: CPU_WATCHDOG_THRESHOLD,
				thresholdIntervals: CPU_WATCHDOG_SUSTAINED_PERIODS,
				thresholdRssMb: CPU_WATCHDOG_MEMORY_RSS_MB,
				reason,
			},
			level: "warning",
		});
		console.error(`[watchdog] Triggered restart due to ${reason}. Shutting down gracefully...`, {
			cpuPercent,
			rssMb,
		});

		// Graceful shutdown
		void (async () => {
			try {
				console.log("[watchdog] Disconnecting from Discord...");
				await DISCORD_CLIENT.destroy();
				console.log("[watchdog] Disconnected successfully");
			} catch (error) {
				console.error("[watchdog] Error during graceful shutdown:", error);
			} finally {
				console.log("[watchdog] Exiting process");
				process.exit(95);
			}
		})();
	}, CPU_WATCHDOG_INTERVAL_MS);

	timer.unref();
}

process.on("unhandledRejection", (reason: unknown) => {
	captureWithSentry(reason, {
		origin: "process.unhandledRejection",
		level: "fatal",
	});
});

process.on("uncaughtException", (error: Error) => {
	captureWithSentry(error, {
		origin: "process.uncaughtException",
		level: "fatal",
	});
});
//

// Connect to the database
try {
	connect();
} catch (error) {
	console.error("Failed to connect to database:", error);
	captureWithSentry(error, {
		origin: "db.connect",
		level: "fatal",
	});
	process.exit(1);
}

// Initialize the client
export const DISCORD_CLIENT = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildInvites,
		GatewayIntentBits.GuildModeration,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMessagePolls,
	],
	partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
	sweepers: {
		...Options.DefaultSweeperSettings,
		messages: {
			interval: 3_600, // Every hour.
			lifetime: 1_800, // Remove messages older than 30 minutes.
		},
		users: {
			interval: 3_600, // Every hour.
			// Use constant to avoid InvalidStateError during reconnection when client.user may be null
			filter: () => (user) => user.bot && user.id !== AGENT_USER_ID, // Remove all bots except self.
		},
	},
});

// @ts-expect-error
DISCORD_CLIENT.commands = new Collection();

// Initialize commands
for (const command of commands) {
	if ("data" in command && "execute" in command) {
		// @ts-expect-error
		DISCORD_CLIENT.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command is missing a required "data" or "execute" property.`);
	}
}

// Initialize events
for (const event of events) {
	// if (event.name === Events.PresenceUpdate) {
	// 	console.log("Initializing event", event.name);
	// }
	const handler = wrapEventHandler(event.name, event.execute);
	if (event.once) {
		DISCORD_CLIENT.once(event.name, handler);
	} else {
		DISCORD_CLIENT.on(event.name, handler);
	}
}

DISCORD_CLIENT.on("error", (error) => {
	captureWithSentry(error, {
		origin: "discord.client.error",
		level: "error",
	});
});

// Start the bot
if (!TOKEN) {
	const tokenVar = process.env.NODE_ENV === "development" ? "DEV_TOKEN" : "TOKEN";
	console.error(`Missing ${tokenVar}. Copy .env.example to .env and set your bot token.`);
	process.exit(1);
}

function loginWithRetry() {
	const maxRetries = 3;
	const baseDelay = 1000; // Start with 1 second
	let retries = 0;

	function login() {
		DISCORD_CLIENT.login(TOKEN).catch((error) => {
			if (error?.code === "TokenInvalid") {
				// Retrying won't fix a bad token.
				console.error("Discord rejected the bot token. Check TOKEN (or DEV_TOKEN in development).");
				captureWithSentry(error, { origin: "discord.login", level: "fatal" });
				process.exit(1);
			}
			console.error(`Login failed: ${error.message}. Retrying... (${retries + 1}/${maxRetries})`);
			captureWithSentry(error, {
				origin: "discord.login",
				level: "error",
				extra: { retryAttempt: retries + 1, maxRetries },
			});

			retries++;

			if (retries <= maxRetries) {
				// Exponential backoff: 1s, 2s, 4s
				const delay = baseDelay * 2 ** (retries - 1);
				console.log(`Waiting ${delay}ms before retry...`);
				setTimeout(login, delay);
			} else {
				console.error("Max login retries exceeded. Exiting...");
				captureWithSentry(new Error("Max login retries exceeded"), {
					origin: "discord.login.maxRetries",
					level: "fatal",
					extra: { finalError: error },
				});
				process.exit(1);
			}
		});
	}

	login();
}

loginWithRetry();

// searchImages({ q: "cat" });
