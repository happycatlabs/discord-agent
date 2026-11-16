import { EmbedBuilder, Events, GuildBan } from "discord.js";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

const name = Events.GuildBanAdd;

async function execute(ban: GuildBan) {
	try {
		const user = ban.user;

		const embed = new EmbedBuilder()
			.setColor("Red")
			.setTitle("Member Banned")
			.setDescription(
				`<@${user.id}> (${user.tag || "Unknown Tag"}) has been banned from the server.`,
			)
			.setThumbnail(user.displayAvatarURL() || null) // Ensure null if URL is empty
			.addFields({ name: "User ID", value: user.id });

		await sendMessageToLogChannel({
			event: ban,
			serverId: ban.guild.id,
			embed,
			category: LogCategory.MODERATION,
		});

		// remove server from user in database
		// maybe add a banneduser array to server in db
	} catch (error) {
		reportEventError("guildBanAdd", error, {
			userId: ban.user?.id,
			guildId: ban.guild?.id,
		});
	}
}

export const guildBanAdd = { name, execute };
