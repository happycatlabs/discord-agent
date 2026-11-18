import * as Sentry from "@sentry/bun";
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateUserEconomy } from "../../lib/db/economy";
import {
	SLOT_PAYOUTS,
	canGamble,
	getSlotPayout,
	processLoss,
	processWin,
	spinSlots,
} from "../../lib/economy/gambling";

const REQUIRED_LEVEL = 15;

export const slots = {
	data: new SlashCommandBuilder()
		.setName("slots")
		.setDescription("Try your luck at the slot machine!")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addIntegerOption((option) =>
			option
				.setName("amount")
				.setDescription("Amount of coins to bet")
				.setRequired(true)
				.setMinValue(1),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const userId = interaction.user.id;
			const amount = interaction.options.getInteger("amount");

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

			// Spin the slots
			const reels = spinSlots();
			const multiplier = getSlotPayout(reels);
			const won = multiplier > 0;

			const slotDisplay = `\`[ ${reels[0]} | ${reels[1]} | ${reels[2]} ]\``;

			const embed = new EmbedBuilder().setTimestamp();

			if (won) {
				const payout = processWin({
					serverId,
					userId,
					bet: amount,
					multiplier,
				});

				const user = getOrCreateUserEconomy({ serverId, userId });
				const netGain = payout - amount;

				embed
					.setColor(0xffd700)
					.setTitle("🎰 JACKPOT!")
					.setDescription(
						[
							slotDisplay,
							"",
							`**${multiplier}x** multiplier!`,
							`You won **${payout.toLocaleString()}** coins! (+${netGain.toLocaleString()})`,
							`New balance: **${user.coins.toLocaleString()}** coins`,
						].join("\n"),
					);
			} else {
				processLoss({ serverId, userId, bet: amount });
				const user = getOrCreateUserEconomy({ serverId, userId });

				embed
					.setColor(0x5865f2)
					.setTitle("🎰 Slots")
					.setDescription(
						[
							slotDisplay,
							"",
							"No match...",
							`You lost **${amount.toLocaleString()}** coins.`,
							`New balance: **${user.coins.toLocaleString()}** coins`,
						].join("\n"),
					);
			}

			// Add payout table
			const payoutLines = Object.entries(SLOT_PAYOUTS)
				.sort((a, b) => b[1] - a[1])
				.map(([combo, mult]) => `${combo} = ${mult}x`)
				.join("\n");

			embed.addFields({
				name: "Payouts",
				value: payoutLines,
				inline: true,
			});

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing slots command:", error);
			const errorMessage = "An error occurred while spinning the slots.";
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
