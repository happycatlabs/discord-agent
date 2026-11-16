import type { Event } from "../../lib/types/events";

import { Events, MessageFlags } from "discord.js";
import { getResponseArtifactForUser } from "../../lib/db/response-artifacts";
import { createLogger } from "../../lib/util/logger";
import { reportEventError } from "../util";

const DISCORD_SAFE_CONTENT_LIMIT = 1900;
const logger = createLogger("discord.interaction");

function splitDiscordContent(content: string): string[] {
	if (content.length <= DISCORD_SAFE_CONTENT_LIMIT) return [content];

	const chunks: string[] = [];
	let remaining = content.trim();

	while (remaining.length > DISCORD_SAFE_CONTENT_LIMIT) {
		const slice = remaining.slice(0, DISCORD_SAFE_CONTENT_LIMIT);
		const splitAt = Math.max(
			slice.lastIndexOf("\n\n"),
			slice.lastIndexOf("\n"),
			slice.lastIndexOf(" "),
		);
		const end = splitAt > 1000 ? splitAt : DISCORD_SAFE_CONTENT_LIMIT;
		chunks.push(remaining.slice(0, end).trim());
		remaining = remaining.slice(end).trim();
	}

	if (remaining) chunks.push(remaining);
	return chunks;
}

async function handleExpandButton(interaction: any) {
	const [, artifactIdString] = interaction.customId.split(":");
	const artifactId = Number(artifactIdString);
	if (!Number.isInteger(artifactId)) {
		logger.warn("invalid expand artifact id", {
			customId: interaction.customId,
			userId: interaction.user?.id,
		});
		await interaction.reply({
			content: "That expanded response is no longer available.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	await interaction.deferReply({
		flags: interaction.guildId ? [MessageFlags.Ephemeral] : undefined,
	});

	const artifact = getResponseArtifactForUser({
		artifactId,
		userId: interaction.user.id,
	});

	if (!artifact) {
		logger.warn("expand artifact denied or missing", {
			artifactId,
			userId: interaction.user?.id,
			guildId: interaction.guildId,
		});
		await interaction.editReply({
			content: "That expanded response is private or no longer available.",
		});
		return;
	}

	const chunks = splitDiscordContent(artifact.full_text);
	logger.info("expanded response artifact", {
		artifactId,
		userId: interaction.user?.id,
		guildId: interaction.guildId,
		chunks: chunks.length,
		fullTextLength: artifact.full_text.length,
	});
	await interaction.editReply({ content: chunks[0] || artifact.full_text });

	for (const chunk of chunks.slice(1)) {
		await interaction.followUp({
			content: chunk,
			flags: interaction.guildId ? [MessageFlags.Ephemeral] : undefined,
		});
	}
}

export const interactionCreate: Event = {
	name: Events.InteractionCreate,
	async execute(interaction: any) {
		try {
			if (interaction.isButton?.() && interaction.customId?.startsWith("agent_expand:")) {
				await handleExpandButton(interaction);
				return;
			}

			// Handle autocomplete interactions
			if (interaction.isAutocomplete()) {
				const command = interaction.client.commands.get(interaction.commandName);
				if (command?.autocomplete) {
					try {
						await command.autocomplete(interaction);
					} catch (error) {
						reportEventError("interactionCreate", error, {
							commandName: interaction.commandName,
							interactionId: interaction.id,
							phase: "autocomplete",
						});
					}
				}
				return;
			}

			if (!interaction.isChatInputCommand()) return;

			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				try {
					await interaction.reply({
						content: `Command "${interaction.commandName}" not found.`,
						flags: [MessageFlags.Ephemeral],
					});
				} catch (replyError) {
					reportEventError(
						"interactionCreate",
						replyError,
						{
							commandName: interaction.commandName,
							phase: "commandNotFound.reply",
							interactionId: interaction.id,
						},
						"warning",
					);
				}
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				reportEventError("interactionCreate", error, {
					commandName: interaction.commandName,
					interactionId: interaction.id,
					phase: "command.execute",
				});
				try {
					if (interaction.replied || interaction.deferred) {
						await interaction.followUp({
							content: "There was an error while executing this command!",
							flags: [MessageFlags.Ephemeral],
						});
					} else {
						await interaction.reply({
							content: "There was an error while executing this command!",
							flags: [MessageFlags.Ephemeral],
						});
					}
				} catch (replyError) {
					reportEventError(
						"interactionCreate",
						replyError,
						{
							commandName: interaction.commandName,
							interactionId: interaction.id,
							phase: "command.execute.reply",
						},
						"warning",
					);
				}
			}
		} catch (error) {
			reportEventError("interactionCreate", error, {
				commandName: interaction?.commandName,
				interactionId: interaction?.id,
			});
		}
	},
};
