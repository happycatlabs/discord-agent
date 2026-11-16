import chalk from "chalk";
import { ActivityType, Client, Events, Status } from "discord.js";
import { reportEventError } from "./util";

export const shardResume = {
	name: Events.ShardResume,
	async execute(shardId: number, replayedEvents: number) {
		try {
			console.log(
				chalk.green(`[Shard ${shardId}] Resumed connection (${replayedEvents} events replayed)`),
			);

			// Get client from the shard's manager
			const client = this as unknown as Client;

			// Restore bot status after reconnection
			// Check that WebSocket is ready and client.user is available to avoid InvalidStateError
			try {
				if (client.ws.status !== Status.Ready || !client.user) {
					console.log(
						chalk.yellow(
							`[Shard Resume] Skipping status restore - WebSocket not ready (status: ${client.ws.status})`,
						),
					);
					return;
				}
				client.user.setActivity("Monitoring", { type: ActivityType.Custom });
				console.log(chalk.green("[Shard Resume] Bot status restored"));
			} catch (error) {
				reportEventError("shardResume", error, { phase: "restoreStatus", shardId }, "warning");
			}
		} catch (error) {
			reportEventError("shardResume", error, { shardId, replayedEvents });
		}
	},
};
