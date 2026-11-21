/**
 * Register the production bot's global slash commands with Discord.
 *
 *   bun dc                                    always register
 *   bun scripts/deploy-commands.ts --if-changed   register only if the definitions changed
 *                                             since the last registration (used by scripts/deploy.sh)
 *
 * The last line of output is `commands=registered` or `commands=unchanged`. Exits 1 if Discord
 * rejects the update.
 */
import { REST, Routes } from "discord.js";
import { buildProductionGlobalCommands } from "../src/commands/deployment";
import { PROD_CLIENT_ID, PROD_TOKEN } from "../src/lib/constants";
import { commandsHash, needsRegistration, writeState } from "./command-state";

if (!PROD_CLIENT_ID || !PROD_TOKEN) {
	console.error("CLIENT_ID and TOKEN must be set to register commands.");
	process.exit(1);
}

const onlyIfChanged = process.argv.includes("--if-changed");
const commands = buildProductionGlobalCommands();
const hash = commandsHash(PROD_CLIENT_ID, commands);

if (onlyIfChanged && !needsRegistration(hash)) {
	console.log("Slash commands match the last registration.");
	console.log("commands=unchanged");
	process.exit(0);
}

try {
	await new REST().setToken(PROD_TOKEN).put(Routes.applicationCommands(PROD_CLIENT_ID), {
		body: commands,
	});
	writeState(hash);
	console.log(`Registered ${commands.length} slash commands.`);
	console.log("commands=registered");
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
