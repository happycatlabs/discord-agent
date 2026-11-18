import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getMetricDisplayName } from "../../lib/betting/metrics";
import {
	type BettingMetric,
	getBetCountOnUser,
	getTotalBetCountOnUser,
	getUserBets,
	getWeekStart,
} from "../../lib/db/betting";

export const bets = {
	data: new SlashCommandBuilder()
		.setName("bets")
		.setDescription("View your active bets or bets placed on a user")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addUserOption((option) =>
			option
				.setName("user")
				.setDescription("View bets on this user (or your bets if not specified)")
				.setRequired(false),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const userId = interaction.user.id;
			const targetUser = interaction.options.getUser("user");

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const weekStart = getWeekStart();

			if (targetUser) {
				// View bets on a specific user (public info only)
				const totalBets = getTotalBetCountOnUser({
					serverId,
					targetUserId: targetUser.id,
					weekStart,
				});

				const betsByMetric = getBetCountOnUser({
					serverId,
					targetUserId: targetUser.id,
					weekStart,
				});

				const embed = new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle(`Bets on ${targetUser.username}`)
					.setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
					.setTimestamp();

				if (totalBets === 0) {
					embed.setDescription("No bets placed on this user this week.");
				} else {
					embed.setDescription(
						`**${totalBets}** total bet${totalBets > 1 ? "s" : ""} placed this week`,
					);

					const metricLines = betsByMetric
						.filter((m) => m.count > 0)
						.map(
							(m) =>
								`${getMetricDisplayName(m.metric as BettingMetric)}: ${m.count} bet${m.count > 1 ? "s" : ""}`,
						)
						.join("\n");

					if (metricLines) {
						embed.addFields({
							name: "By Metric",
							value: metricLines,
							inline: false,
						});
					}
				}

				embed.setFooter({
					text: "Bet directions are hidden until weekly reveal!",
				});

				await interaction.reply({ embeds: [embed] });
			} else {
				// View own bets
				const userBets = getUserBets({
					serverId,
					userId,
					unresolvedOnly: true,
				});

				const embed = new EmbedBuilder()
					.setColor(0x5865f2)
					.setTitle("Your Active Bets")
					.setTimestamp();

				if (userBets.length === 0) {
					embed.setDescription("You don't have any active bets this week.");
				} else {
					const betLines: string[] = [];

					for (const bet of userBets) {
						const potentialPayout = Math.floor(bet.amount * bet.multiplier);

						betLines.push(
							[
								`**Bet #${bet.id}**`,
								`Amount: ${bet.amount.toLocaleString()} coins`,
								`Direction: ||${bet.direction.toUpperCase()}||`,
								`Multiplier: ${bet.multiplier}x`,
								`Potential: ${potentialPayout.toLocaleString()} coins`,
							].join("\n"),
						);
					}

					embed.setDescription(betLines.join("\n\n"));

					const totalWagered = userBets.reduce((sum, b) => sum + b.amount, 0);
					embed.addFields({
						name: "Summary",
						value: [
							`Total bets: ${userBets.length}`,
							`Total wagered: ${totalWagered.toLocaleString()} coins`,
						].join("\n"),
						inline: false,
					});
				}

				await interaction.reply({ embeds: [embed] });
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing bets command:", error);
			const errorMessage = "An error occurred while fetching bets.";
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
