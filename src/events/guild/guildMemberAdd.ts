import { EmbedBuilder, Events, type GuildMember } from "discord.js";
import { createUser } from "../../lib/db/user";
import { getServerProperties, getUserProperties } from "../../lib/util";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

const name = Events.GuildMemberAdd;

const enabled = {
	accountCreated: false,
};

async function execute(member: GuildMember) {
	try {
		if (member.user.bot) return;

		const fields = [];

		if (enabled.accountCreated) {
			const accountCreated = {
				name: "Account Created",
				value: member.user.createdAt.toLocaleString(),
				inline: true,
			};
			fields.push(accountCreated);
		}

		const embed = new EmbedBuilder()
			.setColor("Green")
			.setTitle("Member joined")
			.setDescription(`Welcome <@${member.id}> to the server!`)
			.setThumbnail(member.user.displayAvatarURL())
			.addFields([...fields, { name: "User ID", value: member.id }]);

		await sendMessageToLogChannel({
			event: member,
			serverId: member.guild.id,
			embed,
			category: LogCategory.MEMBERS,
		});

		const server = getServerProperties({
			server: member.guild,
		});

		// Add member to database
		await createUser({
			user: getUserProperties({ userObject: member.user }),
			server,
			update: true,
		});
	} catch (error) {
		reportEventError("guildMemberAdd", error, {
			userId: member.user?.id,
			guildId: member.guild?.id,
		});
	}
}

export const guildMemberAdd = { name, execute };
