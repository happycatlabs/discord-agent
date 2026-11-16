import { ContainerBuilder, type Guild, MessageFlags, type TextChannel } from "discord.js";
import {
	getEconomyConfig,
	getLevelReward,
	getOrCreateUserEconomy,
	updateUserCoins,
	updateUserXP,
} from "../db/economy";
import { calculateXpAward, canEarnXp, randomXp } from "./xp-utils";

export {
	calculateReactionXp,
	calculateVoiceXp,
	calculateXpAward,
	canEarnXp,
	levelFromXp,
	randomXp,
	shouldAttemptReactionXp,
	totalXpForLevel,
	xpForLevel,
	xpProgressInLevel,
} from "./xp-utils";

// Award XP to a user and handle level-up
export interface XpAwardResult {
	xpGained: number;
	newXp: number;
	oldLevel: number;
	newLevel: number;
	leveledUp: boolean;
	coinsAwarded: number;
	roleId?: string;
}

// Award a specific XP gain (used for reactions, voice, daily bonuses, etc.)
export const awardXpWithGain = ({
	serverId,
	userId,
	xpGain,
	updateLastXpAt = false,
}: {
	serverId: string;
	userId: string;
	xpGain: number;
	updateLastXpAt?: boolean;
}): XpAwardResult | null => {
	if (xpGain <= 0) return null;

	const config = getEconomyConfig({ serverId });
	if (!config.enabled) return null;

	const user = getOrCreateUserEconomy({ serverId, userId });
	const { newXp, newLevel, leveledUp, coinsAwarded } = calculateXpAward({
		currentXp: user.xp,
		currentLevel: user.level,
		xpGain,
	});

	updateUserXP({
		serverId,
		userId,
		xpGain,
		newLevel: leveledUp ? newLevel : undefined,
		updateLastXpAt,
	});

	let roleId: string | undefined;

	if (leveledUp) {
		updateUserCoins({
			serverId,
			userId,
			amount: coinsAwarded,
			trackTotal: true,
		});

		const reward = getLevelReward({ serverId, level: newLevel });
		if (reward) {
			roleId = reward.role_id;
		}
	}

	return {
		xpGained: xpGain,
		newXp,
		oldLevel: user.level,
		newLevel,
		leveledUp,
		coinsAwarded,
		roleId,
	};
};

export const awardXp = ({
	serverId,
	userId,
}: {
	serverId: string;
	userId: string;
}): XpAwardResult | null => {
	const config = getEconomyConfig({ serverId });
	if (!config.enabled) return null;

	const user = getOrCreateUserEconomy({ serverId, userId });

	// Check cooldown
	if (!canEarnXp(user, config)) return null;

	// Generate random XP
	const xpGain = randomXp(config);
	return awardXpWithGain({
		serverId,
		userId,
		xpGain,
		updateLastXpAt: true,
	});
};

// Send level-up announcement
export const sendLevelUpAnnouncement = async ({
	guild,
	userId,
	newLevel,
	channelId,
}: {
	guild: Guild;
	userId: string;
	newLevel: number;
	channelId: string | null;
}): Promise<void> => {
	if (!channelId) return;

	try {
		const channel = await guild.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) return;

		const member = await guild.members.fetch(userId);
		const avatarUrl = member.displayAvatarURL({ size: 128 });

		const container = new ContainerBuilder()
			.setAccentColor(0xf1c40f) // Bright gold
			.addSectionComponents((section) =>
				section
					.addTextDisplayComponents(
						(text) => text.setContent("-# ✨ LEVEL UP"),
						(text) => text.setContent(`## Level ${newLevel}`),
						(text) => text.setContent(`<@${userId}>`),
					)
					.setThumbnailAccessory((thumbnail) => thumbnail.setURL(avatarUrl)),
			);

		await (channel as TextChannel).send({
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		});
	} catch (error) {
		console.error("Failed to send level-up announcement:", error);
	}
};

// Apply role reward
export const applyRoleReward = async ({
	guild,
	userId,
	roleId,
}: {
	guild: Guild;
	userId: string;
	roleId: string;
}): Promise<boolean> => {
	try {
		const member = await guild.members.fetch(userId);
		const role = await guild.roles.fetch(roleId);

		if (!member || !role) return false;

		// Check if bot can manage this role
		const botMember = await guild.members.fetchMe();
		if (role.position >= botMember.roles.highest.position) {
			console.error(`Cannot assign role ${role.name} - higher than bot's highest role`);
			return false;
		}

		await member.roles.add(role, "Level reward");
		return true;
	} catch (error) {
		console.error("Failed to apply role reward:", error);
		return false;
	}
};

// Generate XP bar for display
export const generateXpBar = (percentage: number, length = 10): string => {
	const filled = Math.round((percentage / 100) * length);
	const empty = length - filled;
	return "█".repeat(filled) + "░".repeat(empty);
};
