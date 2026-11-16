import { deleteMessage } from "../../lib/db/messages";
import { LogCategory, logMessageEvent } from "../../lib/util/logging";

import { Events, type Message } from "discord.js";
import { reportEventError } from "../util";

export const messageDelete = {
	name: Events.MessageDelete,
	async execute(message: Message) {
		try {
			// Safely check if author is a bot. If so, ignore.
			// This should cover most cases of bot messages, which often have embeds.
			if (message.author?.bot) {
				// Optional: console.log(`Ignoring deletion of bot message ${message.id}`);
				return;
			}

			// If message.guild is null (e.g. for DMs, though MessageDelete is usually from guilds)
			// or if other essential data is missing for logging, consider returning.
			if (!message.guild) {
				console.log(
					`Ignoring deletion of message ${message.id} as it has no guild information (possibly a DM or partial).`,
				);
				return;
			}

			// The hasEmbed check was removed as message.author?.bot should suffice.
			// We generally want to log deletions of user-authored messages, even if they have embeds.

			await deleteMessage({ id: message.id });

			await logMessageEvent({
				message,
				type: "delete",
				category: LogCategory.MESSAGES,
			});
		} catch (error) {
			reportEventError("messageDelete", error, {
				messageId: message.id,
				guildId: message.guild?.id,
			});
		}
	},
};
