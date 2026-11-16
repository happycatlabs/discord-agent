import { EmbedBuilder, Events, type Invite } from "discord.js";
import { storeInvite } from "../../lib/db/guild";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

export const inviteCreate = {
	name: Events.InviteCreate,
	async execute(invite: Invite) {
		// Initial guard clause remains outside the try...catch
		if (!invite.guild || !invite.createdAt || !invite.code || !invite.inviterId) {
			console.error(
				"inviteCreate: missing required fields to store invite. Guild, createdAt, code, or inviterId is null.",
			);
			return;
		}

		try {
			const {
				channelId,
				createdAt,
				expiresAt,
				code,
				guild,
				inviter, // This is the User object, can be null
				inviterId, // This is the ID, checked by guard clause
				maxAge,
				maxUses,
				targetUser,
				uses,
			} = invite;
			const serverId = guild.id; // Safe due to guard clause

			const fields = [
				{ name: "Invite Code", value: code },
				{ name: "Channel", value: channelId ? `<#${channelId}>` : "Unknown" },
			];
			if (targetUser) {
				fields.push({
					name: "Target user",
					value: targetUser.username ?? "None", // targetUser itself can be null
				});
			}

			// Create the embed message
			const embed = new EmbedBuilder()
				.setColor("Green")
				.setTitle("Invite Created")
				.setDescription(`An invite has been created by <@${inviterId}>.`);

			if (inviter) {
				embed.setAuthor({
					name: inviter.username,
					iconURL: inviter.displayAvatarURL() || undefined, // Ensure iconURL is string or undefined
				});
			} else {
				// Fallback if inviter User object is not available but inviterId is
				embed.setAuthor({ name: `Inviter ID: ${inviterId}` });
			}

			embed.addFields([
				...fields,
				{
					name: "Expires",
					value: expiresAt ? expiresAt.toLocaleString() : "Never",
				},
			]);

			await sendMessageToLogChannel({
				event: invite,
				serverId,
				embed,
				category: LogCategory.INVITES,
			});

			await storeInvite({
				invite: {
					uses,
					code,
					maxAge,
					maxUses,
					channelId,
					createdAt,
					expiresAt,
					guild: guild.id, // Safe due to guard clause
					inviter: inviterId, // Safe due to guard clause
					targetUser: targetUser?.id,
				},
			});
		} catch (error) {
			reportEventError("inviteCreate", error, {
				inviteCode: invite?.code,
				guildId: invite?.guild?.id,
			});
		}
	},
};
