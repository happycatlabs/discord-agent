import { updateMessage } from "../../lib/db/messages";
import { LogType, log } from "../../lib/util";
import { getServerProperties } from "../../lib/util";
import { getUserProperties } from "../../lib/util";

import { Events } from "discord.js";
import { LogCategory, logMessageEvent } from "../../lib/util/logging";
import { reportEventError } from "../util";

export const messageUpdate = {
	name: Events.MessageUpdate,
	async execute(oldMessage: any, newMessage: any) {
		try {
			if (!oldMessage.content) return;
			if (!newMessage.guild) return;
			const author = getUserProperties({ userObject: newMessage.author });
			const server = getServerProperties({ server: newMessage.guild });

			if (author.isBot) return;
			if (!server.databaseID || !author.databaseID)
				return log(
					`Server not initialized. Skipping message.\nConsider running /init ${server.name}`,
					LogType.MESSAGE_UPDATE,
				);

			if (oldMessage.content === newMessage.content)
				return log("Message content is the same. Skipping message.", LogType.MESSAGE_UPDATE);

			// Create embed for log message
			const embedColor =
				newMessage?.content?.length > oldMessage?.content?.length ? "Green" : "Red";
			await logMessageEvent({
				message: oldMessage,
				fields: [
					{ name: "Before", value: oldMessage.content },
					{
						name: `After ${newMessage.content.length > oldMessage.content.length ? "(+)" : "(-)"}`,
						value: newMessage.content,
					},
				],
				color: embedColor,
				category: LogCategory.MESSAGES,
			});

			// Update in DB
			await updateMessage({
				id: oldMessage.id,
				oldMessage: oldMessage.content,
				newMessage: newMessage.content,
				author: author,
			});
		} catch (error) {
			reportEventError("messageUpdate", error, {
				messageId: newMessage.id,
				guildId: newMessage.guild?.id,
			});
		}
	},
};
