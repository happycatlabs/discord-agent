import { exec } from "node:child_process";
import * as Sentry from "@sentry/node";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ADMIN_USER_IDS } from "../../../lib/constants";

export const deployCommands = {
	data: new SlashCommandBuilder()
		.setName("dc")
		.setDescription("Deploy the commands")
		.addStringOption((option) =>
			option
				.setName("environment")
				.setDescription("The environment to deploy the commands to")
				.setRequired(true),
		)
		.addBooleanOption((option) =>
			option.setName("confirm").setDescription("Confirm the deployment").setRequired(false),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		try {
			const executingUserId = interaction.user.id;
			const environment = interaction.options.getString("environment");
			const confirm = interaction.options.getBoolean("confirm");

			if (!confirm) {
				await interaction.reply({
					content: "Deployment not confirmed. Aborting.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			if (!ADMIN_USER_IDS.includes(executingUserId)) {
				await interaction.reply({
					content: "You are not authorized to use this command.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Deploy dev by default
			const command = environment === "prod" ? "bun dc" : "bun dc-dev";

			exec(command, async (error, stdout, stderr) => {
				try {
					if (error) {
						console.error(`Exec error: ${error.message}`);
						let replyMessage = `Failed to deploy commands. Error: ${error.message}`;
						if (stderr) {
							console.error(`Stderr: ${stderr}`);
							if (stderr.length < 500) {
								// Keep reply manageable
								replyMessage += `\nDetails: ${stderr}`;
							}
						}
						// Ensure interaction is not already replied to (e.g. by confirmation)
						if (!interaction.replied && !interaction.deferred) {
							await interaction.reply({
								content: replyMessage,
								flags: [MessageFlags.Ephemeral],
							});
						} else {
							await interaction.followUp({
								content: replyMessage,
								flags: [MessageFlags.Ephemeral],
							});
						}
						return;
					}

					let outputMessage = stdout || "Commands deployed successfully (no output).";
					if (stderr) {
						// Log stderr even if no exec error, as it might contain warnings
						console.warn(`Stderr (non-error): ${stderr}`);
						if (outputMessage.length + stderr.length < 1900) {
							outputMessage += `\nWarnings: ${stderr}`;
						}
					}

					if (outputMessage.length > 2000) {
						console.log("Deployment output (too long for Discord reply):\n", outputMessage);
						if (!interaction.replied && !interaction.deferred) {
							await interaction.reply({
								content: "Deployment output was too long. Please check the bot's console.",
								flags: [MessageFlags.Ephemeral],
							});
						} else {
							await interaction.followUp({
								content: "Deployment output was too long. Please check the bot's console.",
								flags: [MessageFlags.Ephemeral],
							});
						}
					} else {
						if (!interaction.replied && !interaction.deferred) {
							await interaction.reply({
								content: outputMessage,
								flags: [MessageFlags.Ephemeral],
							});
						} else {
							await interaction.followUp({
								content: outputMessage,
								flags: [MessageFlags.Ephemeral],
							});
						}
					}
				} catch (replyError) {
					Sentry.captureException(replyError);
					console.error(`Failed to send deployment status reply: ${String(replyError)}`);
				}
			});
		} catch (error) {
			Sentry.captureException(error);
			throw error;
		}
	},
};
