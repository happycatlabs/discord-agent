import {
	buildDevelopmentGlobalCommands,
	buildDevelopmentGuildCommands,
} from "../src/commands/deployment";
import { DEV_CLIENT_ID, DEV_GUILD_IDS, DEV_TOKEN } from "../src/lib/constants";

require("dotenv").config();

const { REST, Routes } = require("discord.js");

const guilds = DEV_GUILD_IDS;

const guildCommands = buildDevelopmentGuildCommands();
const globalCommands = buildDevelopmentGlobalCommands();

// Construct and prepare instances of the REST module
const rest = new REST().setToken(DEV_TOKEN);

void (async () => {
	try {
		// Deploy the commands to each guild
		let count = 0;
		for (const guildId of guilds) {
			await rest.put(Routes.applicationGuildCommands(DEV_CLIENT_ID, guildId), {
				body: guildCommands,
			});

			count++;
		}

		await rest.put(Routes.applicationCommands(DEV_CLIENT_ID), {
			body: globalCommands,
		});

		console.log(
			`✅ Reloaded ${guildCommands.length} guild commands in ${count} server${
				count > 1 ? "s" : ""
			} and ${globalCommands.length} global DM commands.`,
		);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();
