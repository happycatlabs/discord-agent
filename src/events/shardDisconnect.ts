import chalk from "chalk";
import { Events } from "discord.js";
import { reportEventError } from "./util";

export const shardDisconnect = {
	name: Events.ShardDisconnect,
	async execute(closeEvent: CloseEvent, shardId: number) {
		try {
			console.log(
				chalk.red(
					`[Shard ${shardId}] Disconnected - Code: ${closeEvent.code}, Reason: ${closeEvent.reason || "Unknown"}`,
				),
			);
		} catch (error) {
			reportEventError("shardDisconnect", error, { shardId });
		}
	},
};
