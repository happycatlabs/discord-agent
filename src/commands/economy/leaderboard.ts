import * as Sentry from "@sentry/node";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";
import { getLeaderboard, getUserRank } from "../../lib/db/economy";

const USERS_PER_PAGE = 10;

export const leaderboard = {
	data: new SlashCommandBuilder()
		.setName("leaderboard")
		.setDescription("View the server XP leaderboard")
		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription("What to sort by")
				.setRequired(false)
				.addChoices(
					{ name: "XP (default)", value: "xp" },
					{ name: "Level", value: "level" },
					{ name: "Coins", value: "coins" },
				),
		),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const sortBy = interaction.options.getString("type") || "xp";

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const page = 0;
			const { embed, hasNext } = await buildLeaderboardPage({
				serverId,
				sortBy,
				page,
				interaction,
			});

			const row = buildPaginationRow(page, { hasNext });

			await interaction.reply({
				embeds: [embed],
				components: row ? [row] : [],
			});

			if (!row) {
				return;
			}

			const response = await interaction.fetchReply();

			// Create collector for button interactions
			const collector = response.createMessageComponentCollector({
				time: 120000, // 2 minutes
			});

			let currentPage = page;
			let currentHasNext = hasNext;

			collector.on("collect", async (i: any) => {
				if (i.user.id !== interaction.user.id) {
					await i.reply({
						content: "You can't use these buttons.",
						flags: [MessageFlags.Ephemeral],
					});
					return;
				}

				let nextPage = currentPage;
				if (i.customId === "lb_prev") {
					nextPage = Math.max(0, currentPage - 1);
				} else if (i.customId === "lb_next") {
					if (!currentHasNext) {
						await i.deferUpdate();
						return;
					}
					nextPage = currentPage + 1;
				}

				const { embed: newEmbed, hasNext: nextHasNext } = await buildLeaderboardPage({
					serverId,
					sortBy,
					page: nextPage,
					interaction,
				});
				const newRow = buildPaginationRow(nextPage, { hasNext: nextHasNext });

				currentPage = nextPage;
				currentHasNext = nextHasNext;

				await i.update({
					embeds: [newEmbed],
					components: newRow ? [newRow] : [],
				});
			});

			collector.on("end", async () => {
				// Disable buttons after timeout
				const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId("lb_prev")
						.setLabel("Previous")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(true),
					new ButtonBuilder()
						.setCustomId("lb_next")
						.setLabel("Next")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(true),
				);

				await response.edit({ components: [disabledRow] }).catch(() => {});
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing leaderboard command:", error);
			const errorMessage = "An error occurred while fetching the leaderboard.";
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

async function buildLeaderboardPage({
	serverId,
	sortBy,
	page,
	interaction,
}: {
	serverId: string;
	sortBy: string;
	page: number;
	interaction: any;
}): Promise<{ embed: EmbedBuilder; hasNext: boolean }> {
	const offset = page * USERS_PER_PAGE;
	const users = getLeaderboard({
		serverId,
		limit: USERS_PER_PAGE + 1,
		offset,
		sortBy: sortBy as "xp" | "level" | "coins",
	});
	const hasNext = users.length > USERS_PER_PAGE;
	const pageUsers = hasNext ? users.slice(0, USERS_PER_PAGE) : users;

	const userRank = getUserRank({ serverId, userId: interaction.user.id });

	const sortLabel = sortBy === "coins" ? "Coins" : sortBy === "level" ? "Level" : "XP";

	const embed = new EmbedBuilder()
		.setColor(0xffd700)
		.setTitle(`${interaction.guild?.name ?? "Server"} Leaderboard`)
		.setDescription(`Sorted by **${sortLabel}**`)
		.setTimestamp();

	if (pageUsers.length === 0) {
		embed.addFields({
			name: "No Data",
			value: "No users have earned XP yet!",
		});
	} else {
		const lines: string[] = [];
		for (let i = 0; i < pageUsers.length; i++) {
			const user = pageUsers[i];
			const position = offset + i + 1;
			const medal =
				position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;

			const value =
				sortBy === "coins"
					? `${user.coins.toLocaleString()} coins`
					: sortBy === "level"
						? `Level ${user.level}`
						: `${user.xp.toLocaleString()} XP`;

			lines.push(`${medal} <@${user.user_id}> - ${value}`);
		}

		embed.addFields({
			name: `Rankings (Page ${page + 1})`,
			value: lines.join("\n"),
		});
	}

	if (userRank) {
		embed.setFooter({
			text: `Your rank: #${userRank}`,
			iconURL: interaction.user.displayAvatarURL(),
		});
	}

	return { embed, hasNext };
}

function buildPaginationRow(
	page: number,
	{ hasNext }: { hasNext: boolean },
): ActionRowBuilder<ButtonBuilder> | null {
	if (page === 0 && !hasNext) {
		return null;
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("lb_prev")
			.setLabel("Previous")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page === 0),
		new ButtonBuilder()
			.setCustomId("lb_next")
			.setLabel("Next")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(!hasNext),
	);
}
