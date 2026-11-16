import { EmbedBuilder, Events, type GuildMember } from "discord.js"; // Added EmbedBuilder
import {
	handleNicknameChange,
	handleServerAvatarChange,
	handleServerBannerChange,
} from "../../lib/handlers/user";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging"; // Added sendMessageToLogChannel
import { reportEventError } from "../util";

async function handleRoleChange(oldMember: GuildMember, newMember: GuildMember) {
	try {
		const oldRoles = oldMember.roles.cache;
		const newRoles = newMember.roles.cache;

		const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id));
		const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id));

		if (addedRoles.size > 0) {
			const roleNames = addedRoles.map((r) => r.name).join(", ");
			const embed = new EmbedBuilder()
				.setColor("Green")
				.setTitle("Roles Added")
				.setDescription(`Roles added to <@${newMember.id}> (${newMember.user.tag}): ${roleNames}`)
				.setTimestamp();
			await sendMessageToLogChannel({
				event: newMember, // Use newMember for context like guild, client
				serverId: newMember.guild.id,
				embed,
				category: LogCategory.ROLES,
			});
		}

		if (removedRoles.size > 0) {
			const roleNames = removedRoles.map((r) => r.name).join(", ");
			const embed = new EmbedBuilder()
				.setColor("Orange") // Using Orange for removed roles for visual distinction
				.setTitle("Roles Removed")
				.setDescription(
					`Roles removed from <@${newMember.id}> (${newMember.user.tag}): ${roleNames}`,
				)
				.setTimestamp();
			await sendMessageToLogChannel({
				event: newMember,
				serverId: newMember.guild.id,
				embed,
				category: LogCategory.ROLES,
			});
		}
	} catch (error) {
		reportEventError(
			"guildMemberUpdate",
			error,
			{
				userId: newMember.user?.id,
				guildId: newMember.guild?.id,
				phase: "handleRoleChange",
			},
			"warning",
		);
	}
}

export const guildMemberUpdate = {
	name: Events.GuildMemberUpdate,
	async execute(oldMember: GuildMember, newMember: GuildMember) {
		try {
			// server avatar changes
			await handleServerAvatarChange(oldMember, newMember);

			// server banner changes
			await handleServerBannerChange(oldMember, newMember);

			// role changes
			await handleRoleChange(oldMember, newMember);

			// nickname changes
			await handleNicknameChange(oldMember, newMember);
		} catch (error) {
			reportEventError("guildMemberUpdate", error, {
				userId: newMember.user?.id,
				guildId: newMember.guild?.id,
			});
		}
	},
};
