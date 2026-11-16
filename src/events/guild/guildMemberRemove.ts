import { EmbedBuilder, Events, type GuildMember } from "discord.js";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

const name = Events.GuildMemberRemove;

const enabled = {
	accountCreated: false,
};

async function execute(member: GuildMember) {
	try {
		const fields = [];

		// Safe access for member.user properties
		if (enabled.accountCreated && member.user) {
			const accountCreated = {
				name: "Account Created",
				value: member.user.createdAt.toLocaleString(), // Assuming member.user exists here
				inline: true,
			};
			fields.push(accountCreated);
		}

		const embed = new EmbedBuilder()
			.setColor("Red")
			.setTitle("Member left")
			.setDescription(`<@${member.id}> (${member.user?.tag || "Unknown Tag"}) has left the server.`)
			.setThumbnail(member.user?.displayAvatarURL() || null) // Safe access and fallback
			.addFields([...fields, { name: "User ID", value: member.id }]);

		await sendMessageToLogChannel({
			event: member,
			serverId: member.guild.id,
			embed,
			category: LogCategory.MEMBERS,
		});

		// Remove server from user in database
	} catch (error) {
		reportEventError("guildMemberRemove", error, {
			userId: member.user?.id,
			guildId: member.guild?.id,
		});
	}
}

export const guildMemberRemove = { name, execute };
