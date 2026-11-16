import * as Sentry from "@sentry/node";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getBet, voidBet } from "../../lib/db/betting";
import { updateEconomyConfig, updateUserCoins } from "../../lib/db/economy";
import { triggerManualResolution } from "../../lib/scheduler";

export const bettingAdmin = {
	data: new SlashCommandBuilder()
		.setName("betting-admin")
		.setDescription("Betting system administration commands")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("channel")
				.setDescription("Set the betting reveal channel")
				.addChannelOption((option) =>
					option
						.setName("channel")
						.setDescription("The channel for weekly betting reveals")
						.setRequired(true),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("void")
				.setDescription("Void and refund a specific bet")
				.addIntegerOption((option) =>
					option
						.setName("bet_id")
						.setDescription("The bet ID to void")
						.setRequired(true)
						.setMinValue(1),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("resolve")
				.setDescription("Manually trigger weekly betting resolution (for testing)"),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const subcommand = interaction.options.getSubcommand();

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			switch (subcommand) {
				case "channel": {
					const channel = interaction.options.getChannel("channel");

					// Use the levelup channel for betting reveals too for now
					updateEconomyConfig({
						serverId,
						updates: { levelup_channel_id: channel.id },
					});

					await interaction.reply({
						content: `Weekly betting reveals will now be sent to ${channel}.`,
						flags: [MessageFlags.Ephemeral],
					});
					break;
				}

				case "void": {
					const betId = interaction.options.getInteger("bet_id");

					const bet = getBet({ betId });

					if (!bet) {
						await interaction.reply({
							content: `Bet #${betId} not found.`,
							flags: [MessageFlags.Ephemeral],
						});
						return;
					}

					if (bet.resolved) {
						await interaction.reply({
							content: `Bet #${betId} has already been resolved and cannot be voided.`,
							flags: [MessageFlags.Ephemeral],
						});
						return;
					}

					// Refund the bet
					updateUserCoins({
						serverId: bet.server_id,
						userId: bet.bettor_user_id,
						amount: bet.amount,
						trackTotal: false,
					});

					// Delete the bet
					voidBet({ betId });

					await interaction.reply({
						content: `Voided bet #${betId} and refunded ${bet.amount.toLocaleString()} coins to <@${bet.bettor_user_id}>.`,
						flags: [MessageFlags.Ephemeral],
					});
					break;
				}

				case "resolve": {
					await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

					await triggerManualResolution(interaction.client);

					await interaction.editReply({
						content:
							"Manual betting resolution triggered. Check the configured channel for results.",
					});
					break;
				}
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing betting admin command:", error);
			const errorMessage = "An error occurred.";
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
