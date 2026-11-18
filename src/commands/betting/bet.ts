import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { formatLine, getOrCalculateLine } from "../../lib/betting/lines";
import { getMetricDisplayName } from "../../lib/betting/metrics";
import {
	type BettingMetric,
	METRIC_CUTOFFS,
	canBetOnMetric,
	getCurrentMultiplier,
	placeBet,
} from "../../lib/db/betting";
import { getEconomyConfig, getOrCreateUserEconomy, updateUserCoins } from "../../lib/db/economy";

export const bet = {
	data: new SlashCommandBuilder()
		.setName("bet")
		.setDescription("Place a bet on a user's weekly performance")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to bet on").setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("metric")
				.setDescription("What to bet on")
				.setRequired(true)
				.addChoices(
					{ name: "Messages", value: "messages" },
					{ name: "XP Earned", value: "xp" },
					{ name: "Voice Minutes", value: "voice_minutes" },
					{ name: "Daily Streak", value: "streak_days" },
					{ name: "Leaderboard Position", value: "leaderboard_position" },
				),
		)
		.addStringOption((option) =>
			option
				.setName("direction")
				.setDescription("Over or under the line?")
				.setRequired(true)
				.addChoices({ name: "Over", value: "over" }, { name: "Under", value: "under" }),
		)
		.addIntegerOption((option) =>
			option
				.setName("amount")
				.setDescription("Amount of coins to bet")
				.setRequired(true)
				.setMinValue(1),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const userId = interaction.user.id;
			const targetUser = interaction.options.getUser("user");
			const metric = interaction.options.getString("metric") as BettingMetric;
			const direction = interaction.options.getString("direction") as "over" | "under";
			const amount = interaction.options.getInteger("amount");

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const config = getEconomyConfig({ serverId });
			if (!config.enabled) {
				await interaction.reply({
					content: "Economy is disabled in this server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Check betting cutoff
			if (!canBetOnMetric(metric)) {
				const cutoffDay = METRIC_CUTOFFS[metric];
				const dayNames = [
					"",
					"Sunday",
					"Monday",
					"Tuesday",
					"Wednesday",
					"Thursday",
					"Friday",
					"Saturday",
				];
				await interaction.reply({
					content: `Betting on **${getMetricDisplayName(metric)}** closes on ${dayNames[cutoffDay]}. It's too late to place this bet.`,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Check user can bet
			const user = getOrCreateUserEconomy({ serverId, userId });
			if (user.coins < amount) {
				await interaction.reply({
					content: `You don't have enough coins. You have ${user.coins.toLocaleString()} coins.`,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			if (amount < config.min_bet) {
				await interaction.reply({
					content: `Minimum bet is ${config.min_bet} coins.`,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			if (amount > config.max_bet) {
				await interaction.reply({
					content: `Maximum bet is ${config.max_bet.toLocaleString()} coins.`,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Can't bet on yourself
			if (targetUser.id === userId) {
				await interaction.reply({
					content: "You can't bet on yourself!",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Get or create the line
			const line = getOrCalculateLine({
				serverId,
				userId: targetUser.id,
				metric,
			});

			// Get current multiplier
			const multiplier = getCurrentMultiplier();

			// Deduct coins
			updateUserCoins({ serverId, userId, amount: -amount, trackTotal: false });

			// Place the bet
			const betId = placeBet({
				serverId,
				lineId: line.id,
				bettorUserId: userId,
				direction,
				amount,
				multiplier,
			});

			const potentialPayout = Math.floor(amount * multiplier);
			const lineDisplay = formatLine({ metric, lineValue: line.line_value });

			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setTitle("Bet Placed!")
				.setDescription(
					[
						`You bet **${amount.toLocaleString()}** coins on <@${targetUser.id}>`,
						"",
						`**${getMetricDisplayName(metric)}**: ${direction.toUpperCase()} ${lineDisplay}`,
						`Multiplier: **${multiplier}x**`,
						`Potential payout: **${potentialPayout.toLocaleString()}** coins`,
					].join("\n"),
				)
				.addFields({
					name: "Your bet",
					value: `Bet ID: #${betId}`,
					inline: true,
				})
				.setFooter({
					text: "Results revealed at end of week!",
				})
				.setTimestamp();

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing bet command:", error);
			const errorMessage = "An error occurred while placing your bet.";
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
