import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";

export const banner = {
	data: new SlashCommandBuilder()
		.setName("banner")
		.setDescription("Displays the user's banner")
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to get the banner of").setRequired(true),
		)
		.addBooleanOption((option) =>
			option.setName("private").setDescription("Show only to you").setRequired(false),
		),

	async execute(interaction: any) {
		try {
			const ephemeral = interaction.options.getBoolean("private");
			const user = interaction.options.getUser("user");

			// Fetch user with force to get banner data
			const fetchedUser = await user.fetch(true);
			const bannerUrl = fetchedUser.bannerURL({ size: 1024 });

			if (!bannerUrl) {
				const message = `${user.username} doesn't have a banner set.`;
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						content: message,
						flags: [MessageFlags.Ephemeral],
					});
				} else {
					await interaction.reply({
						content: message,
						flags: [MessageFlags.Ephemeral],
					});
				}
				return;
			}

			const embed = new EmbedBuilder()
				.setColor(0x0099ff)
				.setTitle(`${user.username}'s Banner`)
				.setAuthor({
					name: user.username,
					iconURL: user.displayAvatarURL({ size: 256 }),
				})
				.setImage(bannerUrl)
				.setTimestamp()
				.setFooter({
					text: interaction.client.user?.username || "Bot",
					iconURL: interaction.client.user?.displayAvatarURL() || undefined,
				});

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					embeds: [embed],
					flags: ephemeral ? [MessageFlags.Ephemeral] : undefined,
				});
			} else {
				await interaction.reply({
					embeds: [embed],
					flags: ephemeral ? [MessageFlags.Ephemeral] : undefined,
				});
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing banner command:", error);
			const errorMessage = "An error occurred while trying to fetch the banner.";
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
			throw error;
		}
	},
};
