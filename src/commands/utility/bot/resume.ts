import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { unignoreChannel } from "../../../lib/db/guild";
import { unignoreUser } from "../../../lib/db/guild/ignore-user";

export const resumeLogging = {
	data: new SlashCommandBuilder()
		.setName("resume")
		.setDescription("Resume logging actions from a selected entity.")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("user")
				.setDescription("Log actions from this user.")
				.addUserOption((option) =>
					option
						.setName("user")
						.setDescription("The user to resume logging actions from.")
						.setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("channel")
				.setDescription("Log actions in this channel.")
				.addChannelOption((option) =>
					option
						.setName("channel")
						.setDescription("The channel to resume logging actions in.")
						.setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		try {
			const target =
				interaction.options.getUser("user") || interaction.options.getChannel("channel");

			const type = target?.tag ? "user" : "channel";
			const isUser = type === "user";

			const description = `Resuming logging for ${`<${isUser ? "@" : "#"}${target.id}>`}`;

			// Create an embed with the user's avatar
			const embed = new EmbedBuilder().setColor(0x0099ff).setDescription(description);

			let dbSuccess = false; // Renamed to avoid conflict
			if (isUser) {
				// Resume logging for user
				dbSuccess = await unignoreUser({
					id: target.id,
					guildId: interaction.guild.id,
				});
			} else {
				// Resume logging for channel
				dbSuccess = await unignoreChannel({
					id: target.id,
					guildId: interaction.guild.id,
				});
			}

			if (dbSuccess) {
				await interaction.reply({
					embeds: [embed],
					...(isUser ? { flags: [MessageFlags.Ephemeral] } : {}),
				});
			} else {
				// Reply on failure of the DB operation
				await interaction.reply({
					content: "Failed to resume logging for the target. Please try again.",
					flags: [MessageFlags.Ephemeral],
				});
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing resume command:", error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: "An error occurred while trying to resume logging.",
					flags: [MessageFlags.Ephemeral],
				});
			} else {
				await interaction.reply({
					content: "An error occurred while trying to resume logging.",
					flags: [MessageFlags.Ephemeral],
				});
			}
			throw error;
		}
	},
};
