import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ignoreChannel, ignoreUser } from "../../../lib/db/guild/ignore-user";

export const ignore = {
	data: new SlashCommandBuilder()
		.setName("ignore")
		.setDescription("Ignores actions from a selected entity.")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("user")
				.setDescription("Ignore actions from this user.")
				.addUserOption((option) =>
					option.setName("user").setDescription("The user to ignore").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("channel")
				.setDescription("Ignore actions in this channel.")
				.addChannelOption((option) =>
					option.setName("channel").setDescription("The channel to ignore").setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		try {
			const target =
				interaction.options.getUser("user") || interaction.options.getChannel("channel");

			const type = target?.tag ? "user" : "channel";
			const isUser = type === "user";

			const description = `Ignoring${isUser ? " actions from" : ""} ${`<${
				isUser ? "@" : "#"
			}${target.id}>`}`;

			// Create an embed with the user's avatar
			const embed = new EmbedBuilder().setColor(0x0099ff).setDescription(description);

			let dbSuccess = false; // Renamed to avoid conflict with the overall success of the command execution
			if (isUser) {
				dbSuccess = await ignoreUser({
					id: target.id,
					guildId: interaction.guild.id,
				});
			} else {
				dbSuccess = await ignoreChannel({
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
					content: "Failed to ignore the target. Please try again or check bot permissions.",
					flags: [MessageFlags.Ephemeral],
				});
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing ignore command:", error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: "An error occurred while trying to ignore the target.",
					flags: [MessageFlags.Ephemeral],
				});
			} else {
				await interaction.reply({
					content: "An error occurred while trying to ignore the target.",
					flags: [MessageFlags.Ephemeral],
				});
			}
			throw error;
		}
	},
};
