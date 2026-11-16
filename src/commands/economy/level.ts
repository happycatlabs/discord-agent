import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateUserEconomy } from "../../lib/db/economy";
import { generateXpBar, xpProgressInLevel } from "../../lib/economy/xp";

export const level = {
	data: new SlashCommandBuilder()
		.setName("level")
		.setDescription("View your level and XP progress")
		.addBooleanOption((option) =>
			option.setName("private").setDescription("Only you can see the response").setRequired(false),
		),

	async execute(interaction: any) {
		try {
			const isPrivate = interaction.options.getBoolean("private") ?? false;
			const serverId = interaction.guildId;

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const economy = getOrCreateUserEconomy({
				serverId,
				userId: interaction.user.id,
			});

			const progress = xpProgressInLevel(economy.xp, economy.level);
			const xpBar = generateXpBar(progress.percentage, 12);

			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setAuthor({
					name: interaction.user.username,
					iconURL: interaction.user.displayAvatarURL({ size: 256 }),
				})
				.addFields(
					{
						name: "Level",
						value: `**${economy.level}**`,
						inline: true,
					},
					{
						name: "Total XP",
						value: economy.xp.toLocaleString(),
						inline: true,
					},
					{
						name: "Progress",
						value: `${xpBar}\n${progress.current.toLocaleString()} / ${progress.needed.toLocaleString()} XP (${progress.percentage}%)`,
						inline: false,
					},
				);

			await interaction.reply({
				embeds: [embed],
				flags: isPrivate ? [MessageFlags.Ephemeral] : [],
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing level command:", error);
			const errorMessage = "An error occurred while fetching your level.";
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
