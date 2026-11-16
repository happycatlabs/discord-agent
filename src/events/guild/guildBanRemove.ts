import { EmbedBuilder, Events, GuildBan } from "discord.js";
// DISCORD_CLIENT import removed as it's no longer directly used here
// getServerProperties import removed as it's no longer directly used here
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

const name = Events.GuildBanRemove;

async function execute(ban: GuildBan) {
	try {
		const user = ban.user;

		// Simplified logging: always send a new, distinct message for unban.
		// The complex logic for finding and replying to old messages has been removed.

		const embed = new EmbedBuilder()
			.setColor("Blue")
			.setTitle("Member Unbanned")
			.setDescription(
				`<@${user.id}> (${user.tag || "Unknown Tag"}) has been unbanned from the server.`,
			)
			.setThumbnail(user.displayAvatarURL() || null) // Ensure null if URL is empty
			.addFields({ name: "User ID", value: user.id })
			.setTimestamp(new Date());

		await sendMessageToLogChannel({
			event: ban, // ban object contains guild, client etc. for sendMessageToLogChannel
			serverId: ban.guild.id,
			embed,
			category: LogCategory.MODERATION,
		});

		// Remove server from user in the database
		// Maybe add an unbannedUser array to server in the database
	} catch (error) {
		reportEventError("guildBanRemove", error, {
			userId: ban.user?.id,
			guildId: ban.guild?.id,
		});
	}
}

export const guildBanRemove = { name, execute };
