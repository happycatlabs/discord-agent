import * as Sentry from "@sentry/node";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getOrCreateUserEconomy, setUserLevel } from "../../lib/db/economy";
import { totalXpForLevel } from "../../lib/economy/xp";

export const levelsAdmin = {
	data: new SlashCommandBuilder()
		.setName("levels")
		.setDescription("Level system administration commands")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("set")
				.setDescription("Set a user's level")
				.addUserOption((option) =>
					option.setName("user").setDescription("The user").setRequired(true),
				)
				.addIntegerOption((option) =>
					option
						.setName("level")
						.setDescription("The level to set")
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(1000),
				),
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
				case "set": {
					const targetUser = interaction.options.getUser("user");
					const level = interaction.options.getInteger("level");

					getOrCreateUserEconomy({ serverId, userId: targetUser.id });

					const xp = totalXpForLevel(level);
					setUserLevel({ serverId, userId: targetUser.id, level, xp });

					await interaction.reply({
						content: `Set <@${targetUser.id}>'s level to **${level}** (${xp.toLocaleString()} XP).`,
						flags: [MessageFlags.Ephemeral],
					});
					break;
				}
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing levels admin command:", error);
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
