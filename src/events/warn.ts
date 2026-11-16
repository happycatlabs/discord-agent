import chalk from "chalk";
import { Events } from "discord.js";
import { reportEventError } from "./util";

export const warn = {
	name: Events.Warn,
	async execute(warning: string) {
		try {
			console.log(chalk.yellow(`[Discord.js Warning] ${warning}`));

			// Report to Sentry for visibility
			reportEventError("warn", new Error(`Discord.js warning: ${warning}`), { warning }, "warning");
		} catch (error) {
			reportEventError("warn", error, { originalWarning: warning });
		}
	},
};
