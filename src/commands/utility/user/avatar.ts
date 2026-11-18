import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";

export const avatar = {
	data: new SlashCommandBuilder()
		.setName("avatar")
		.setDescription("Displays the user's avatar")
		.addUserOption((option) =>
			option.setName("user").setDescription("The user to get the avatar of").setRequired(true),
		)
		.addBooleanOption((option) =>
			option.setName("private").setDescription("Show only to you").setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription("Which avatar to display")
				.setRequired(false)
				.addChoices(
					{ name: "Global (default)", value: "global" },
					{ name: "Server", value: "server" },
				),
		),

	async execute(interaction: any) {
		try {
			const ephemeral = interaction.options.getBoolean("private");
			const user = interaction.options.getUser("user");
			const member = interaction.guild?.members.resolve(user);
			const avatarType = interaction.options.getString("type") ?? "global";

			let avatarUrl = user.displayAvatarURL({ size: 1024 });
			let avatarLabel = "Global";

			if (avatarType === "server") {
				if (member?.avatar) {
					avatarUrl = member.displayAvatarURL({ size: 1024 });
					avatarLabel = "Server";
				} else if (member && !member.avatar) {
					// User is in server but has no server avatar - show global with note
					avatarLabel = "Global";
				} else if (!member) {
					// User not in server - show global with note
					avatarLabel = "Global";
				}
			}

			// Create an embed with the user's avatar
			const embed = new EmbedBuilder()
				.setColor(0x0099ff)
				.setTitle(`${user.username}'s ${avatarLabel} Avatar`)
				.setAuthor({
					// Author should be the user whose avatar is being shown
					name: user.username,
					iconURL: user.displayAvatarURL({ size: 256 }),
				})
				.setImage(avatarUrl)
				.setTimestamp()
				.setFooter({
					text: interaction.client.user?.username || "Bot", // Fallback for bot username
					iconURL: interaction.client.user?.displayAvatarURL() || undefined, // Fallback for bot avatar
				});

			// Reply with the embed
			// The main reply must be sent first before followUp can be used
			if (interaction.replied || interaction.deferred) {
				// This case should ideally not be hit if followUps were for ephemeral warnings only
				// and the main reply is this one. If hit, it implies a logic error or prior deferral.
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
			console.error("Error executing avatar command:", error);
			const errorMessage = "An error occurred while trying to fetch the avatar.";
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
