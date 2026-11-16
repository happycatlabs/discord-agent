const { SlashCommandBuilder, MessageFlags } = require("discord.js");

export const ping = {
	data: new SlashCommandBuilder()
		.setName("ping")
		.setDescription("Replies with Pong! and current bot latency."), // Updated description
	async execute(interaction) {
		try {
			await interaction.reply({
				content: "Pinging...",
				flags: [MessageFlags.Ephemeral],
			});
			const reply = await interaction.fetchReply();
			const latency = reply.createdTimestamp - interaction.createdTimestamp;
			const wsLatency = interaction.client.ws.ping;
			await interaction.editReply(`Pong! Latency: ${latency}ms. API Latency: ${wsLatency}ms.`);
		} catch (error) {
			console.error("Error executing ping command:", error);
			// Attempt to inform user, gracefully handling if initial reply also failed
			try {
				if (interaction.replied || interaction.deferred) {
					// If initial reply was successful, edit it to show error.
					// If initial reply failed, this editReply will likely fail too, caught by outer catch.
					// But if it was just deferred, this can succeed.
					await interaction.editReply({
						content: "Failed to measure ping. Please try again.",
						flags: [MessageFlags.Ephemeral],
					});
				} else {
					// If initial reply was not even sent or deferred.
					await interaction.reply({
						content: "Failed to measure ping. Please try again.",
						flags: [MessageFlags.Ephemeral],
					});
				}
			} catch (replyError) {
				console.error("Error sending ping failure reply:", replyError);
			}
		}
	},
};
