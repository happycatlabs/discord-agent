import { Events, type MessageReaction, type User } from "discord.js";
import { getReactionRoleMessage, getRoleForEmoji } from "../../lib/db/reaction-roles";
import { reportEventError } from "../util";

export const messageReactionRemove = {
	name: Events.MessageReactionRemove,
	async execute(messageReaction: MessageReaction, user: User) {
		try {
			// Ignore bot reactions
			if (user.bot) return;

			// Handle partial reactions
			if (messageReaction.partial) {
				await messageReaction.fetch();
			}
			if (messageReaction.message.partial) {
				await messageReaction.message.fetch();
			}

			const { message } = messageReaction;
			const { guild } = message;

			// Check if this is a reaction role message
			const reactionRoleConfig = getReactionRoleMessage({
				messageId: message.id,
			});

			if (!reactionRoleConfig) return;

			// In unique mode, removing reaction doesn't remove role
			// (role is only removed when user clicks a different reaction)
			if (reactionRoleConfig.mode === "unique") return;

			// Normal mode: remove the role when reaction is removed
			const emoji = messageReaction.emoji.id || messageReaction.emoji.name;
			if (!emoji || !guild) return;

			const roleId = getRoleForEmoji({
				messageId: message.id,
				emoji,
			});

			if (!roleId) return;

			const member = await guild.members.fetch(user.id);
			if (!member) return;

			await member.roles.remove(roleId);
		} catch (error) {
			reportEventError("messageReactionRemove", error, {
				messageId: messageReaction.message.id,
				reactionEmoji: messageReaction.emoji?.name,
				userId: user.id,
			});
		}
	},
};
