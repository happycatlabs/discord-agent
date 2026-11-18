import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { FEATURE_LEVELING } from "../../lib/constants/flags";
import {
	claimDaily,
	getEconomyConfig,
	getOrCreateUserEconomy,
	updateUserCoins,
	updateUserXP,
} from "../../lib/db/economy";
import {
	calculateDailyRewards,
	calculateDailyStreak,
	getDailyClaimCooldown,
} from "../../lib/economy/daily-utils";
import { levelFromXp } from "../../lib/economy/xp";

export const daily = {
	data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily coins and XP"),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const userId = interaction.user.id;

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			if (!FEATURE_LEVELING) {
				await interaction.reply({
					content: "Leveling is currently disabled on this bot.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const config = getEconomyConfig({ serverId });
			if (!config.enabled) {
				await interaction.reply({
					content: "The economy system is not enabled in this server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const user = getOrCreateUserEconomy({ serverId, userId });

			// Check cooldown + streak with pure helpers for consistent, testable rules.
			const cooldown = getDailyClaimCooldown({ lastDailyAt: user.last_daily_at });
			if (!cooldown.canClaim) {
				await interaction.reply({
					content: `You've already claimed your daily reward! Come back in **${cooldown.hoursLeft}h ${cooldown.minutesLeft}m**.`,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const { newStreak, streakBroken } = calculateDailyStreak({
				lastDailyAt: user.last_daily_at,
				currentStreak: user.daily_streak,
			});

			const { finalCoins, finalXP, streakBonusText, boostText } = calculateDailyRewards({
				config,
				streak: newStreak,
			});

			// Update database
			claimDaily({ serverId, userId, newStreak });
			updateUserCoins({ serverId, userId, amount: finalCoins, trackTotal: true });

			// Award XP and check for level up
			const oldLevel = user.level;
			const newTotalXP = user.xp + finalXP;
			const newLevel = levelFromXp(newTotalXP);
			const leveledUp = newLevel > oldLevel;

			updateUserXP({
				serverId,
				userId,
				xpGain: finalXP,
				newLevel: leveledUp ? newLevel : undefined,
			});

			// Build response embed
			const embed = new EmbedBuilder()
				.setColor(boostText ? 0xffd700 : 0x57f287)
				.setTitle("Daily Reward Claimed!")
				.setDescription(
					[
						`+**${finalCoins.toLocaleString()}** coins`,
						`+**${finalXP.toLocaleString()}** XP`,
						"",
						streakBonusText,
						boostText,
						leveledUp ? `\n**LEVEL UP!** You are now level **${newLevel}**!` : "",
						streakBroken ? `\n*Your ${user.daily_streak} day streak was broken!*` : "",
					]
						.filter(Boolean)
						.join("\n"),
				)
				.addFields({
					name: "Current Streak",
					value: `${newStreak} day${newStreak > 1 ? "s" : ""}`,
					inline: true,
				})
				.setFooter({
					text: "Come back tomorrow to continue your streak!",
				})
				.setTimestamp();

			if (boostText) {
				embed.setThumbnail("https://em-content.zobj.net/source/apple/354/star-struck_1f929.png");
			}

			await interaction.reply({
				embeds: [embed],
				flags: [MessageFlags.Ephemeral],
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing daily command:", error);
			const errorMessage = "An error occurred while claiming your daily reward.";
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: errorMessage,
					flags: [MessageFlags.Ephemeral],
				});
			} else {
				await interaction.reply({
					content: errorMessage,
					flags: [MessageFlags.Ephemeral],
				});
			}
		}
	},
};
