import { SlashCommandBuilder } from "@discordjs/builders";
import * as Sentry from "@sentry/node";
import { InteractionContextType, MessageFlags, PermissionFlagsBits } from "discord.js";

export const purge = {
	data: new SlashCommandBuilder()
		.setName("purge")
		.setDescription("Purge messages from a channel.")
		.addIntegerOption((option) =>
			option.setName("amount").setDescription("The amount of messages to purge.").setRequired(true),
		)
		// .addUserOption((option) =>
		// 	option
		// 		.setName("user")
		// 		.setDescription("The user to purge messages from.")
		// 		.setRequired(false),
		// )
		.addChannelOption((option) =>
			option
				.setName("channel")
				.setDescription("The channel to purge messages in.")
				.setRequired(false),
		)
		.setContexts(InteractionContextType.Guild)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		try {
			if (!interaction.inGuild?.()) {
				await interaction.reply({
					content: "/purge only works in servers.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const channel = interaction.options.getChannel("channel") || interaction.channel;
			const amount = interaction.options.getInteger("amount");
			// const user = interaction.options.getUser("user"); // Unused variable removed

			if (
				!channel?.isTextBased?.() ||
				channel.isThread?.() ||
				typeof channel.bulkDelete !== "function"
			) {
				await interaction.reply({
					// Ensure await for all replies
					content: "Messages can only be purged in standard text channels.",
					flags: [MessageFlags.Ephemeral],
				});
				return; // Return after reply
			}

			if (amount < 1 || amount > 100) {
				await interaction.reply({
					// Ensure await for all replies
					content: "You can only purge between 1 and 100 messages at a time.",
					flags: [MessageFlags.Ephemeral],
				});
				return; // Return after reply
			}

			try {
				// The 'true' argument filters out messages older than 2 weeks
				const deletedMessages = await channel.bulkDelete(amount, true);

				if (deletedMessages.size === 0) {
					await interaction.reply({
						content:
							"No messages were deleted. This might be because all messages in the range were older than 14 days, or the channel was empty in that range.",
						flags: [MessageFlags.Ephemeral],
					});
				} else {
					await interaction.reply({
						content: `Successfully purged ${deletedMessages.size} messages.`,
						flags: [MessageFlags.Ephemeral],
					});
				}
			} catch (error: any) {
				Sentry.captureException(error);
				console.error("Failed to purge messages:", error);
				let errorMessage = "Failed to purge messages.";
				if (error.code === 50034) {
					// DiscordAPIError: You can only bulk delete messages that are under 14 days old.
					errorMessage = "Failed to purge: All messages in the range might be older than 14 days.";
				} else if (error.code === 50013) {
					// DiscordAPIError: Missing Permissions
					errorMessage =
						"Failed to purge: I don't have permission to delete messages in that channel.";
				}

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
		} catch (error) {
			Sentry.captureException(error);
			throw error;
		}
	},
};
