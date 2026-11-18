import { SlashCommandBuilder } from "@discordjs/builders";
import * as Sentry from "@sentry/bun";
import {
	EmbedBuilder,
	type GuildTextBasedChannel,
	MessageFlags,
	PermissionFlagsBits,
} from "discord.js";
import { setChannel } from "../../../lib/db/guild";
import { getServerProperties } from "../../../lib/util";

export const setLogChannel = {
	data: new SlashCommandBuilder()
		.setName("channel")
		.setDescription("Set the channel to log changes in.")
		.addChannelOption((option) =>
			option.setName("channel").setDescription("The channel to log changes in.").setRequired(true),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		try {
			const guild = interaction.guild;
			// It's good practice to ensure guild is available, especially for server-specific commands
			if (!guild) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const serverProperties = getServerProperties({ server: guild });
			const channelOption: GuildTextBasedChannel | null = interaction.options.getChannel("channel");

			// Allow text channels and threads (threads are text-based too)
			if (!channelOption || !channelOption.isTextBased()) {
				await interaction.reply({
					content: "Please select a valid text-based channel (text channel or thread) for logging.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Assuming setChannel returns a boolean or throws on error
			await setChannel({
				channel: { id: channelOption.id, name: channelOption.name },
				server: serverProperties,
			});

			const channelPrefix = channelOption.isThread() ? "thread" : "#";
			const embed = new EmbedBuilder()
				.setColor("Green") // Changed to Green for success
				.setTitle(`Logging channel set to ${channelPrefix}${channelOption.name}.`)
				.setTimestamp();
			await interaction.reply({
				embeds: [embed],
				flags: MessageFlags.Ephemeral,
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing setLogChannel command:", error);
			const errorMessage =
				"An error occurred while setting the log channel. Please check the bot console for details.";
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: errorMessage,
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					content: errorMessage,
					flags: MessageFlags.Ephemeral,
				});
			}
			throw error;
		}
	},
};
