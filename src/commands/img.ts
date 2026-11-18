import * as Sentry from "@sentry/bun";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageComponentInteraction,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { searchImages } from "../lib/search";

export default {
	data: new SlashCommandBuilder()
		.setName("img")
		.setDescription("Search for images using Google")
		.addStringOption((option) =>
			option.setName("query").setDescription("The search query").setRequired(true),
		)
		.addBooleanOption((option) =>
			option.setName("private").setDescription("Show only to you").setRequired(false),
		),
	async execute(interaction: any) {
		const query = interaction.options.getString("query", true);

		const ephemeral = interaction.options.getBoolean("private") ?? false;

		await interaction.deferReply({
			flags: ephemeral ? [MessageFlags.Ephemeral] : undefined,
		});

		const provider = "serp";

		try {
			const images = await searchImages({
				q: query,
				num: 50,
				provider,
				guildId: interaction.guild?.id ?? "dm",
				userId: interaction.user.id,
			});

			if (images.length === 0) {
				await interaction.editReply("No images found for the given query.");
				return;
			}

			let currentIndex = 0;

			const createEmbed = (index: number) => {
				const embed = new EmbedBuilder()
					.setColor(0x0099ff)

					.setImage(images[index].original)
					.setTimestamp()
					.setFooter({
						text: `Image ${index + 1}/${images.length}`,
						iconURL: "https://www.google.com/s2/favicons?domain=google.com",
					});

				const sourceLogo = images[index].source_logo;
				if (sourceLogo) {
					embed.setThumbnail(sourceLogo);
				}
				// console.log(images[index]); // This line is removed
				if (images[index].title) {
					embed.setTitle(`"${query}"`);
					embed.setDescription(`[${images[index]?.title}](${images[index].url})`);
				} else {
					embed.setTitle(`"${query}"`);
					embed.setURL(images[index].url);
				}

				return embed;
			};

			const createButtons = (index: number) => {
				const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId("previous")
						.setLabel("Previous")
						.setStyle(ButtonStyle.Primary)
						.setDisabled(index === 0),
					new ButtonBuilder()
						.setCustomId("next")
						.setLabel("Next")
						.setStyle(ButtonStyle.Primary)
						.setDisabled(index === images.length - 1),
					new ButtonBuilder()
						.setCustomId("random")
						.setLabel("Random")
						.setStyle(ButtonStyle.Secondary),
					new ButtonBuilder().setCustomId("delete").setLabel("Delete").setStyle(ButtonStyle.Danger),
				);
				return row;
			};

			const embed = createEmbed(currentIndex);
			const row = createButtons(currentIndex);

			const reply = await interaction.editReply({
				embeds: [embed],
				components: [row],
			});

			const collector = reply.createMessageComponentCollector({ time: 60000 });

			collector.on("collect", async (i: MessageComponentInteraction) => {
				if (i.customId === "next" && currentIndex < images.length - 1) {
					currentIndex++;
				} else if (i.customId === "previous" && currentIndex > 0) {
					currentIndex--;
				} else if (i.customId === "random") {
					currentIndex = Number.parseInt(String(Math.random() * images.length), 10);
				} else if (i.customId === "delete") {
					try {
						if (ephemeral) {
							await i.update({
								content: "Image viewer closed.",
								embeds: [],
								components: [],
							});
							collector.stop("userInitiatedClose"); // Custom reason
						} else {
							// The `reply` object from `interaction.editReply` is the message.
							// No need to fetch `i.message` if `reply` is in scope and is the message object.
							if (reply && !reply.deleted) {
								// 'reply' is the message from interaction.editReply
								await reply.delete();
							}
							await i.deferUpdate(); // Acknowledge the button press
							collector.stop("messageDeleteInitiated"); // Custom reason
						}
					} catch (error) {
						console.error("Error processing delete button:", error);
						// Attempt to inform user if ephemeral, otherwise it's harder as message might be gone
						// Using i.followUp for ephemeral errors after an update attempt
						if (ephemeral && !i.replied && !i.deferred) {
							// Check if we can still reply/followUp
							await i
								.reply({
									content: "Failed to close the image viewer.",
									flags: MessageFlags.Ephemeral,
								})
								.catch(console.error);
						} else if (ephemeral) {
							await i
								.followUp({
									content: "Failed to close the image viewer.",
									flags: MessageFlags.Ephemeral,
								})
								.catch(console.error);
						}
						// For non-ephemeral, if message deletion failed, the original message might still be there.
						// A follow-up here could be confusing if the message is gone.
						// The main error is logged, which is important.
					}
					return;
				}

				const newEmbed = createEmbed(currentIndex);
				const newRow = createButtons(currentIndex);

				await i.update({ embeds: [newEmbed], components: [newRow] });
			});

			collector.on("end", async (_collected: unknown, reason: string) => {
				// Added async and reason
				try {
					// Only attempt to edit if the message wasn't deleted by our handlers
					if (reason !== "messageDeleteInitiated" && reason !== "userInitiatedClose") {
						// 'reply' is the message object from `await interaction.editReply`
						if (reply && !reply.deleted && reply.components.length > 0) {
							await interaction.editReply({ components: [] });
						}
					}
				} catch (error: any) {
					// Typed error
					// console.warn is fine, as this is often expected if message is already gone.
					console.warn(
						"Error trying to remove components on collector end (message might be deleted or inaccessible):",
						error.message,
					);
				}
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error(`Error executing /img command with ${provider} provider:`, error);
			await interaction.editReply(
				"An error occurred while searching for images. Please try again later.",
			);
			throw error;
		}
	},
};
