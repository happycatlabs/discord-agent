import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { formatLine, getOrCalculateLine } from "../../lib/betting/lines";
import { ALL_METRICS, getMetricDisplayName } from "../../lib/betting/metrics";
import { METRIC_CUTOFFS, canBetOnMetric, getCurrentMultiplier } from "../../lib/db/betting";

export const lines = {
	data: new SlashCommandBuilder()
		.setName("lines")
		.setDescription("View betting lines for a user")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to view lines for").setRequired(true),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const targetUser = interaction.options.getUser("user");

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const currentMultiplier = getCurrentMultiplier();

			const embed = new EmbedBuilder()
				.setColor(0xffd700)
				.setTitle(`Betting Lines - ${targetUser.username}`)
				.setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
				.setDescription(
					`Current multiplier: **${currentMultiplier}x**\nBet earlier in the week for better odds!`,
				)
				.setTimestamp();

			const dayNames = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

			for (const metric of ALL_METRICS) {
				const line = getOrCalculateLine({
					serverId,
					userId: targetUser.id,
					metric,
				});

				const lineDisplay = formatLine({ metric, lineValue: line.line_value });
				const canBet = canBetOnMetric(metric);
				const cutoffDay = METRIC_CUTOFFS[metric];

				const status = canBet ? "🟢 Open" : "🔴 Closed";
				const cutoffText = `(closes ${dayNames[cutoffDay]})`;

				embed.addFields({
					name: `${getMetricDisplayName(metric)} ${cutoffText}`,
					value: `${lineDisplay}\n${status}`,
					inline: true,
				});
			}

			embed.setFooter({
				text: "Use /bet to place a bet | /odds to see multiplier schedule",
			});

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing lines command:", error);
			const errorMessage = "An error occurred while fetching lines.";
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
