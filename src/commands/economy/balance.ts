import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getOrCreateUserEconomy } from "../../lib/db/economy";

export const balance = {
	data: new SlashCommandBuilder()
		.setName("balance")
		.setDescription("View your coin balance")
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

			const embed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setAuthor({
					name: interaction.user.username,
					iconURL: interaction.user.displayAvatarURL({ size: 256 }),
				})
				.setDescription(`**${economy.coins.toLocaleString()}** coins`);

			await interaction.reply({
				embeds: [embed],
				flags: isPrivate ? [MessageFlags.Ephemeral] : [],
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing balance command:", error);
			const errorMessage = "An error occurred while fetching your balance.";
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
