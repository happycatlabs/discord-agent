import * as Sentry from "@sentry/node";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateUserEconomy } from "../../lib/db/economy";
import { canGamble, processLoss, processWin } from "../../lib/economy/gambling";

const REQUIRED_LEVEL = 5;

export const coinflip = {
	data: new SlashCommandBuilder()
		.setName("coinflip")
		.setDescription("Flip a coin - double your coins or lose them all!")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addIntegerOption((option) =>
			option
				.setName("amount")
				.setDescription("Amount of coins to bet")
				.setRequired(true)
				.setMinValue(1),
		)
		.addStringOption((option) =>
			option
				.setName("choice")
				.setDescription("Your choice")
				.setRequired(true)
				.addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const userId = interaction.user.id;
			const amount = interaction.options.getInteger("amount");
			const choice = interaction.options.getString("choice");

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Check if user can gamble
			const check = canGamble({
				serverId,
				userId,
				amount,
				requiredLevel: REQUIRED_LEVEL,
			});

			if (!check.allowed) {
				await interaction.reply({
					content: check.reason,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Flip the coin
			const result = Math.random() < 0.5 ? "heads" : "tails";
			const won = result === choice;

			const embed = new EmbedBuilder().setTimestamp();

			if (won) {
				const payout = processWin({
					serverId,
					userId,
					bet: amount,
					multiplier: 2,
				});

				const user = getOrCreateUserEconomy({ serverId, userId });

				embed
					.setColor(0x57f287)
					.setTitle(`🪙 ${result.toUpperCase()}!`)
					.setDescription(
						[
							`The coin landed on **${result}**!`,
							"",
							`You won **${payout.toLocaleString()}** coins!`,
							`New balance: **${user.coins.toLocaleString()}** coins`,
						].join("\n"),
					);
			} else {
				processLoss({ serverId, userId, bet: amount });
				const user = getOrCreateUserEconomy({ serverId, userId });

				embed
					.setColor(0xed4245)
					.setTitle(`🪙 ${result.toUpperCase()}!`)
					.setDescription(
						[
							`The coin landed on **${result}**...`,
							"",
							`You lost **${amount.toLocaleString()}** coins.`,
							`New balance: **${user.coins.toLocaleString()}** coins`,
						].join("\n"),
					);
			}

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing coinflip command:", error);
			const errorMessage = "An error occurred while flipping the coin.";
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
