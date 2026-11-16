import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateUserEconomy, getUserRank } from "../../lib/db/economy";
import { xpProgressInLevel } from "../../lib/economy/xp";

/**
 * Generate a visual progress bar
 * Uses filled/empty segments for clean appearance
 */
const createProgressBar = (percentage: number, length = 14): string => {
	const filled = Math.round((percentage / 100) * length);
	const empty = length - filled;
	return "▰".repeat(filled) + "▱".repeat(empty);
};

/**
 * Format large numbers concisely
 * 1234 -> "1,234"
 * 12345 -> "12.3k"
 * 1234567 -> "1.2m"
 */
const formatNumber = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toLocaleString();
};

const buildProfileEmbed = ({
	targetUser,
	economy,
	rankPosition,
}: {
	targetUser: any;
	economy: any;
	rankPosition: number | null;
}) => {
	const progress = xpProgressInLevel(economy.xp, economy.level);
	const progressBar = createProgressBar(progress.percentage);
	const rankDisplay = rankPosition ? `#${rankPosition}` : "—";

	// Build the description with clear visual hierarchy
	const description = [
		// Hero stats: Level and Rank
		`**Level ${economy.level}** · Rank ${rankDisplay}`,
		"",
		// XP Progress
		`${progressBar} ${progress.percentage}%`,
		`\`${formatNumber(progress.current)} / ${formatNumber(progress.needed)} XP\``,
		"",
		// Current wealth
		`**${economy.coins.toLocaleString()}** coins`,
	].join("\n");

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setAuthor({
			name: targetUser.displayName || targetUser.username,
			iconURL: targetUser.displayAvatarURL({ size: 128 }),
		})
		.setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
		.setDescription(description)
		.addFields(
			{
				name: "Total XP",
				value: formatNumber(economy.xp),
				inline: true,
			},
			{
				name: "Lifetime Coins",
				value: formatNumber(economy.total_coins_earned),
				inline: true,
			},
		);

	// Add streak to footer if > 0
	if (economy.daily_streak > 0) {
		embed.setFooter({
			text: `🔥 ${economy.daily_streak} day streak`,
		});
	}

	return embed;
};

export const profile = {
	data: new SlashCommandBuilder()
		.setName("profile")
		.setDescription("View economy profile")
		.addBooleanOption((option) =>
			option.setName("private").setDescription("Only show the result to you").setRequired(false),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const targetUser = interaction.user;
			const isEphemeral = interaction.options.getBoolean("private") ?? false;

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const economy = getOrCreateUserEconomy({
				serverId,
				userId: targetUser.id,
			});

			const rankPosition = getUserRank({ serverId, userId: targetUser.id });
			const embed = buildProfileEmbed({ targetUser, economy, rankPosition });

			await interaction.reply({
				embeds: [embed],
				...(isEphemeral ? { flags: [MessageFlags.Ephemeral] } : {}),
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing profile command:", error);
			const errorMessage = "An error occurred while fetching profile info.";
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
