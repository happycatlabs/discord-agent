import { Events, type MessageReaction, type User } from "discord.js";
import { REACTION_XP } from "../../lib/constants/economy";
import { FEATURE_LEVELING } from "../../lib/constants/flags";
import { getEconomyConfig, recordReactionXpAward } from "../../lib/db/economy";
import {
	getAllMappingsForMessage,
	getReactionRoleMessage,
	getRoleForEmoji,
} from "../../lib/db/reaction-roles";
import {
	applyRoleReward,
	awardXpWithGain,
	calculateReactionXp,
	sendLevelUpAnnouncement,
	shouldAttemptReactionXp,
} from "../../lib/economy/xp";
import { reportEventError } from "../util";

export const messageReactionAdd = {
	name: Events.MessageReactionAdd,
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
			const { author, guild } = message;

			// Check if this is a reaction role message
			const reactionRoleConfig = getReactionRoleMessage({
				messageId: message.id,
			});

			if (reactionRoleConfig) {
				// Handle reaction role logic
				const emoji = messageReaction.emoji.id || messageReaction.emoji.name;
				if (!emoji || !guild) return;

				const roleId = getRoleForEmoji({
					messageId: message.id,
					emoji,
				});

				if (!roleId) return;

				const member = await guild.members.fetch(user.id);
				if (!member) return;

				// Handle unique mode - remove other roles from this message first
				if (reactionRoleConfig.mode === "unique") {
					const allMappings = getAllMappingsForMessage({
						messageId: message.id,
					});

					const otherRoleIds = allMappings
						.filter((m) => m.role_id !== roleId)
						.map((m) => m.role_id);

					// Remove other roles the user has from this group
					const rolesToRemove = member.roles.cache
						.filter((role) => otherRoleIds.includes(role.id))
						.map((role) => role.id);

					if (rolesToRemove.length > 0) {
						await member.roles.remove(rolesToRemove);
					}

					// Remove user's other reactions from this message
					for (const mapping of allMappings) {
						if (mapping.emoji !== emoji) {
							const reaction = message.reactions.cache.find(
								(r) => (r.emoji.id || r.emoji.name) === mapping.emoji,
							);
							if (reaction) {
								await reaction.users.remove(user.id);
							}
						}
					}
				}

				// Add the role
				await member.roles.add(roleId);
				return;
			}

			// Reward the message author once per reacting user to prevent XP farming.
			if (
				guild &&
				FEATURE_LEVELING &&
				author &&
				shouldAttemptReactionXp({
					authorIsBot: author.bot,
					isSelfReaction: author.id === user.id,
				})
			) {
				const recorded = recordReactionXpAward({
					serverId: guild.id,
					messageId: message.id,
					reactorUserId: user.id,
					authorUserId: author.id,
				});

				if (!recorded) return;

				const xpGain = calculateReactionXp({ baseXp: REACTION_XP });
				const xpResult = awardXpWithGain({
					serverId: guild.id,
					userId: author.id,
					xpGain,
					updateLastXpAt: false,
				});

				if (xpResult?.leveledUp) {
					const config = getEconomyConfig({ serverId: guild.id });
					await sendLevelUpAnnouncement({
						guild,
						userId: author.id,
						newLevel: xpResult.newLevel,
						channelId: config.levelup_channel_id,
					});

					if (xpResult.roleId) {
						await applyRoleReward({
							guild,
							userId: author.id,
							roleId: xpResult.roleId,
						});
					}
				}
			}
		} catch (error) {
			reportEventError("messageReactionAdd", error, {
				messageId: messageReaction.message.id,
				reactionEmoji: messageReaction.emoji?.name,
				userId: user.id,
			});
		}
	},
};
