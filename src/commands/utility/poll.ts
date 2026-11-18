import * as Sentry from "@sentry/bun";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
export const poll = {
	data: new SlashCommandBuilder()
		.setName("poll")
		.setDescription("Create a poll")

		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription("The type of poll")
				.setRequired(true)
				.addChoices(
					{ name: "Game", value: "game" },
					{ name: "Yes/No", value: "yesno" },
					{ name: "Multiple Choice", value: "multiple" },
					{ name: "Rating", value: "rating" },
				),
		)
		.addStringOption((option) =>
			option
				.setName("duration")
				.setDescription("The duration of the poll")
				.setRequired(false)
				.addChoices(
					{ name: "1 hour", value: "60" },
					{ name: "2 hours", value: "120" },
					{ name: "4 hours", value: "240" },
					{ name: "6 hours", value: "360" },
					{ name: "12 hours", value: "720" },
					{ name: "1 day", value: "1440" },
				),
		),

	async execute(interaction: any) {
		try {
			console.log(
				interaction.createdTimestamp +
					Number(interaction.options.getString("duration") || "15") * 60000,
			);
			await interaction.channel.send({
				poll: {
					question: { text: "What game should we play?" },
					answers: [
						{ text: "ARAM" },
						{ text: "Val" },
						{ text: "Tekken" },
						{ text: "Fortnite" },
						{ text: "TFT" },
						{ text: "Town of Salem" },
					],
					allowMultiselect: true,
					duration: interaction.options.getString("duration")
						? Number(interaction.options.getString("duration")) / 60
						: 0.25,
				},
			});
			await interaction.reply({
				content: "Poll created",
				flags: [MessageFlags.Ephemeral],
			});
		} catch (error) {
			Sentry.captureException(error);
			throw error;
		}
	},
};
