import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ALL_METRICS, getMetricDisplayName } from "../../lib/betting/metrics";
import { DAY_MULTIPLIERS, METRIC_CUTOFFS, getCurrentMultiplier } from "../../lib/db/betting";

export const odds = {
	data: new SlashCommandBuilder()
		.setName("odds")
		.setDescription("View betting multipliers and cutoff times")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		try {
			const currentMultiplier = getCurrentMultiplier();
			const today = new Date().getUTCDay();

			const dayNames = [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			];

			const embed = new EmbedBuilder()
				.setColor(0xffd700)
				.setTitle("Betting Odds & Schedule")
				.setDescription(
					`Today is **${dayNames[today]}**\nCurrent multiplier: **${currentMultiplier}x**`,
				)
				.setTimestamp();

			// Multiplier schedule
			const multiplierLines: string[] = [];
			for (let day = 0; day < 7; day++) {
				const mult = DAY_MULTIPLIERS[day];
				const isToday = day === today;
				const prefix = isToday ? "▶️ " : "  ";
				const suffix = isToday ? " ← You are here" : "";
				multiplierLines.push(`${prefix}**${dayNames[day]}**: ${mult}x${suffix}`);
			}

			embed.addFields({
				name: "Daily Multipliers",
				value: multiplierLines.join("\n"),
				inline: false,
			});

			// Metric cutoffs
			const cutoffLines: string[] = [];
			const dayNumbers = [
				"",
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			];

			for (const metric of ALL_METRICS) {
				const cutoffDay = METRIC_CUTOFFS[metric];
				const cutoffName = dayNumbers[cutoffDay];
				cutoffLines.push(`**${getMetricDisplayName(metric)}**: Closes ${cutoffName}`);
			}

			embed.addFields({
				name: "Betting Cutoffs",
				value: cutoffLines.join("\n"),
				inline: false,
			});

			// How it works
			embed.addFields({
				name: "How It Works",
				value: [
					"• Bet on whether a user will go **over** or **under** their line",
					"• Lines are calculated from their 3-week average",
					"• Bet earlier in the week for higher multipliers",
					"• Results revealed every Sunday at midnight UTC",
					"• Your bet direction stays hidden until reveal!",
				].join("\n"),
				inline: false,
			});

			embed.setFooter({
				text: "Use /lines @user to see betting lines | /bet to place a bet",
			});

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing odds command:", error);
			const errorMessage = "An error occurred while fetching odds.";
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
