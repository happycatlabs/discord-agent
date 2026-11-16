/**
 * Remove registered slash commands.
 *
 *   bun scripts/clear-commands.ts prod   # prod bot: global + DEV_GUILD_IDS guild commands
 *   bun scripts/clear-commands.ts dev    # dev bot:  global + DEV_GUILD_IDS guild commands
 *
 * Run `prod` after testing so the prod bot doesn't show duplicate commands in dev servers.
 */
import { REST, Routes } from "discord.js";
import {
	DEV_CLIENT_ID,
	DEV_GUILD_IDS,
	DEV_TOKEN,
	PROD_CLIENT_ID,
	PROD_TOKEN,
} from "../src/lib/constants";

require("dotenv").config();

const target = process.argv[2];
if (target !== "prod" && target !== "dev") {
	console.error("Usage: bun scripts/clear-commands.ts <prod|dev>");
	process.exit(1);
}

const token = target === "prod" ? PROD_TOKEN : DEV_TOKEN;
const clientId = target === "prod" ? PROD_CLIENT_ID : DEV_CLIENT_ID;
if (!token || !clientId) {
	console.error(`Missing ${target === "prod" ? "TOKEN/CLIENT_ID" : "DEV_TOKEN/DEV_CLIENT_ID"}.`);
	process.exit(1);
}

const rest = new REST().setToken(token);

void (async () => {
	await rest.put(Routes.applicationCommands(clientId), { body: [] });
	console.log(`✅ Cleared global commands for the ${target} bot.`);

	for (const guildId of DEV_GUILD_IDS) {
		await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
		console.log(`✅ Cleared guild commands for the ${target} bot in ${guildId}.`);
	}
})().catch((error) => {
	console.error("❌ Error clearing commands:", error);
	process.exit(1);
});
