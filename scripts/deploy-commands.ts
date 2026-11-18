import { buildProductionGlobalCommands } from "../src/commands/deployment";
import { PROD_CLIENT_ID, PROD_TOKEN } from "../src/lib/constants";

require("dotenv").config();

const { REST, Routes } = require("discord.js");

const _commands = buildProductionGlobalCommands();

// Construct and prepare instances of the REST module
const prodRest = new REST().setToken(PROD_TOKEN);

void (async () => {
	try {
		await prodRest.put(Routes.applicationCommands(PROD_CLIENT_ID), {
			body: _commands,
		});

		console.log("✅ Reloaded commands");
	} catch (error) {
		console.error(error);
		// Fail loudly so scripts/deploy.sh and CI see that registration didn't happen.
		process.exitCode = 1;
	}
})();
