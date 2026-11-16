import { EmbedBuilder, Events, type Invite } from "discord.js";
import { deleteInvite, getInvite } from "../../lib/db/guild";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

export const inviteDelete = {
	name: Events.InviteDelete,
	async execute(invite: Invite) {
		// Initial guard clause for code remains outside try...catch
		if (!invite.code) {
			console.error("inviteDelete: missing invite code from event object.");
			return;
		}

		try {
			const { channelId, code, guild, targetUser } = invite; // `uses` from event is unreliable

			const inviteFromDB = await getInvite({ code });

			const embed = new EmbedBuilder()
				.setColor("Red")
				.setTitle("Invite Deleted")
				.setDescription(`Invite code \`${code}\` has been deleted.`);

			const fields: { name: string; value: string; inline?: boolean }[] = [
				{ name: "Invite Code", value: code },
				{ name: "Channel", value: channelId ? `<#${channelId}>` : "Unknown" },
			];

			if (inviteFromDB) {
				fields.push({ name: "Inviter", value: `<@${inviteFromDB.inviter}>` });
				fields.push({
					name: "Uses",
					value: inviteFromDB.uses?.toString() ?? "Unknown",
				});
				// Potentially add other details from DB if needed, like createdAt
			} else {
				console.warn(
					`inviteDelete: Invite code ${code} not found in DB. Logging with available info.`,
				);
				// Inviter is unknown if not in DB
				fields.push({ name: "Inviter", value: "Unknown (not found in DB)" });
				// Uses count is unknown if not in DB
				fields.push({ name: "Uses", value: "Unknown" });
			}

			// Add targetUser if present in the event (though it's often null for delete events)
			if (targetUser) {
				fields.push({
					name: "Original Target User", // Clarify this is from the event, might not be current
					value: targetUser.username ?? "None",
				});
			}

			embed.addFields(fields);

			await sendMessageToLogChannel({
				event: invite,
				serverId: guild?.id,
				embed,
				category: LogCategory.INVITES,
			});

			// Attempt to delete from DB even if it wasn't found (idempotent or handles not found)
			await deleteInvite({ code });
		} catch (error) {
			reportEventError("inviteDelete", error, {
				inviteCode: invite?.code,
				guildId: invite?.guild?.id,
			});
		}
	},
};
