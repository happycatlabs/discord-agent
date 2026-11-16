import chalk from "chalk";
import { Events } from "discord.js";
import { reportEventError } from "./util";

export const shardReconnecting = {
	name: Events.ShardReconnecting,
	async execute(shardId: number) {
		try {
			console.log(chalk.yellow(`[Shard ${shardId}] Reconnecting...`));
		} catch (error) {
			reportEventError("shardReconnecting", error, { shardId });
		}
	},
};
