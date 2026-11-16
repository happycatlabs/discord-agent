import * as Sentry from "@sentry/node";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import { getOrCreateUserEconomy, updateUserCoins } from "../../lib/db/economy";
import {
	type Card,
	canGamble,
	createDeck,
	formatHand,
	getHandValue,
	isBlackjack,
	isBust,
	shuffleDeck,
} from "../../lib/economy/gambling";

const REQUIRED_LEVEL = 25;

interface BlackjackGame {
	deck: Card[];
	playerHand: Card[];
	dealerHand: Card[];
	bet: number;
	doubled: boolean;
}

// Store active games in memory
const activeGames = new Map<string, BlackjackGame>();

export const blackjack = {
	data: new SlashCommandBuilder()
		.setName("blackjack")
		.setDescription("Play a game of blackjack against the dealer!")
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
			const gameKey = `${serverId}:${userId}`;

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Check for existing game
			if (activeGames.has(gameKey)) {
				await interaction.reply({
					content: "You already have an active blackjack game! Finish it first.",
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

			// Deduct bet immediately
			updateUserCoins({ serverId, userId, amount: -amount, trackTotal: false });

			// Create and shuffle deck
			const deck = shuffleDeck(createDeck());

			// Deal initial cards
			const playerHand: Card[] = [deck.pop()!, deck.pop()!];
			const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

			const game: BlackjackGame = {
				deck,
				playerHand,
				dealerHand,
				bet: amount,
				doubled: false,
			};

			// Check for player blackjack
			if (isBlackjack(playerHand)) {
				// Check for dealer blackjack too
				if (isBlackjack(dealerHand)) {
					// Push - return bet
					updateUserCoins({ serverId, userId, amount, trackTotal: false });
					const user = getOrCreateUserEconomy({ serverId, userId });

					const embed = buildGameEmbed({
						game,
						showDealer: true,
						result: "push",
						message: "Both have Blackjack! Push.",
						balance: user.coins,
					});

					await interaction.reply({ embeds: [embed] });
					return;
				}

				// Player wins with blackjack (3:2 payout)
				const payout = Math.floor(amount * 2.5);
				updateUserCoins({ serverId, userId, amount: payout, trackTotal: true });
				const user = getOrCreateUserEconomy({ serverId, userId });

				const embed = buildGameEmbed({
					game,
					showDealer: true,
					result: "blackjack",
					message: `BLACKJACK! You win ${payout.toLocaleString()} coins!`,
					balance: user.coins,
				});

				await interaction.reply({ embeds: [embed] });
				return;
			}

			// Store game state
			activeGames.set(gameKey, game);

			// Build initial embed with buttons
			const embed = buildGameEmbed({
				game,
				showDealer: false,
				result: null,
				message: null,
				balance: null,
			});

			const canDouble = getOrCreateUserEconomy({ serverId, userId }).coins >= amount;
			const row = buildActionRow(canDouble);

			await interaction.reply({
				embeds: [embed],
				components: [row],
			});
			const response = await interaction.fetchReply();

			// Create collector
			const collector = response.createMessageComponentCollector({
				time: 60000, // 1 minute timeout
			});

			collector.on("collect", async (i: any) => {
				if (i.user.id !== userId) {
					await i.reply({
						content: "This isn't your game!",
						flags: [MessageFlags.Ephemeral],
					});
					return;
				}

				const currentGame = activeGames.get(gameKey);
				if (!currentGame) {
					await i.reply({
						content: "Game not found.",
						flags: [MessageFlags.Ephemeral],
					});
					return;
				}

				if (i.customId === "bj_hit") {
					// Draw a card
					currentGame.playerHand.push(currentGame.deck.pop()!);

					if (isBust(currentGame.playerHand)) {
						// Player busts
						activeGames.delete(gameKey);
						collector.stop();

						const user = getOrCreateUserEconomy({ serverId, userId });
						const lostAmount = currentGame.doubled ? currentGame.bet * 2 : currentGame.bet;

						const endEmbed = buildGameEmbed({
							game: currentGame,
							showDealer: true,
							result: "bust",
							message: `Bust! You lost ${lostAmount.toLocaleString()} coins.`,
							balance: user.coins,
						});

						await i.update({ embeds: [endEmbed], components: [] });
						return;
					}

					// Continue game
					const continueEmbed = buildGameEmbed({
						game: currentGame,
						showDealer: false,
						result: null,
						message: null,
						balance: null,
					});

					await i.update({
						embeds: [continueEmbed],
						components: [buildActionRow(false)],
					});
				} else if (i.customId === "bj_stand") {
					// Dealer plays
					await dealerPlay(i, currentGame, serverId, userId, gameKey, collector);
				} else if (i.customId === "bj_double") {
					// Double down - deduct additional bet
					updateUserCoins({
						serverId,
						userId,
						amount: -currentGame.bet,
						trackTotal: false,
					});
					currentGame.doubled = true;

					// Draw exactly one card
					currentGame.playerHand.push(currentGame.deck.pop()!);

					if (isBust(currentGame.playerHand)) {
						// Player busts
						activeGames.delete(gameKey);
						collector.stop();

						const user = getOrCreateUserEconomy({ serverId, userId });
						const lostAmount = currentGame.bet * 2;

						const endEmbed = buildGameEmbed({
							game: currentGame,
							showDealer: true,
							result: "bust",
							message: `Bust! You lost ${lostAmount.toLocaleString()} coins.`,
							balance: user.coins,
						});

						await i.update({ embeds: [endEmbed], components: [] });
						return;
					}

					// Dealer plays
					await dealerPlay(i, currentGame, serverId, userId, gameKey, collector);
				}
			});

			collector.on("end", async (_collected: unknown, reason: string) => {
				if (reason === "time" && activeGames.has(gameKey)) {
					// Timeout - player forfeits
					activeGames.delete(gameKey);
					const user = getOrCreateUserEconomy({ serverId, userId });

					const embed = new EmbedBuilder()
						.setColor(0xed4245)
						.setTitle("🃏 Blackjack - Timeout")
						.setDescription(
							`You took too long! You forfeited your bet of ${amount.toLocaleString()} coins.\nBalance: ${user.coins.toLocaleString()} coins`,
						);

					await response.edit({ embeds: [embed], components: [] }).catch(() => {});
				}
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing blackjack command:", error);
			const errorMessage = "An error occurred while playing blackjack.";
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

async function dealerPlay(
	interaction: any,
	game: BlackjackGame,
	serverId: string,
	userId: string,
	gameKey: string,
	collector: any,
) {
	// Dealer draws until 17 or higher
	while (getHandValue(game.dealerHand) < 17) {
		game.dealerHand.push(game.deck.pop()!);
	}

	activeGames.delete(gameKey);
	collector.stop();

	const playerValue = getHandValue(game.playerHand);
	const dealerValue = getHandValue(game.dealerHand);
	const dealerBust = isBust(game.dealerHand);

	const totalBet = game.doubled ? game.bet * 2 : game.bet;
	let result: "win" | "lose" | "push";
	let message: string;
	let payout = 0;

	if (dealerBust) {
		result = "win";
		payout = totalBet * 2;
		message = `Dealer busts! You win ${payout.toLocaleString()} coins!`;
	} else if (playerValue > dealerValue) {
		result = "win";
		payout = totalBet * 2;
		message = `You win with ${playerValue} vs ${dealerValue}! +${payout.toLocaleString()} coins`;
	} else if (playerValue < dealerValue) {
		result = "lose";
		message = `Dealer wins with ${dealerValue} vs ${playerValue}. Lost ${totalBet.toLocaleString()} coins.`;
	} else {
		result = "push";
		payout = totalBet;
		message = `Push! Both have ${playerValue}. Bet returned.`;
	}

	if (payout > 0) {
		updateUserCoins({
			serverId,
			userId,
			amount: payout,
			trackTotal: result === "win",
		});
	}

	const user = getOrCreateUserEconomy({ serverId, userId });

	const embed = buildGameEmbed({
		game,
		showDealer: true,
		result,
		message,
		balance: user.coins,
	});

	await interaction.update({ embeds: [embed], components: [] });
}

function buildGameEmbed({
	game,
	showDealer,
	result,
	message,
	balance,
}: {
	game: BlackjackGame;
	showDealer: boolean;
	result: "win" | "lose" | "push" | "bust" | "blackjack" | null;
	message: string | null;
	balance: number | null;
}): EmbedBuilder {
	const playerValue = getHandValue(game.playerHand);
	const dealerValue = getHandValue(game.dealerHand);

	let color = 0x5865f2; // Default blue
	if (result === "win" || result === "blackjack") color = 0x57f287;
	else if (result === "lose" || result === "bust") color = 0xed4245;
	else if (result === "push") color = 0xfee75c;

	const embed = new EmbedBuilder().setColor(color).setTitle("🃏 Blackjack").setTimestamp();

	// Dealer hand
	let dealerDisplay: string;
	let dealerValueDisplay: string;
	if (showDealer) {
		dealerDisplay = formatHand(game.dealerHand);
		dealerValueDisplay = `(${dealerValue})`;
	} else {
		dealerDisplay = `${formatHand([game.dealerHand[0]])} 🂠`;
		dealerValueDisplay = "(?)";
	}

	embed.addFields(
		{
			name: `Dealer ${dealerValueDisplay}`,
			value: dealerDisplay,
			inline: false,
		},
		{
			name: `Your Hand (${playerValue})`,
			value: formatHand(game.playerHand),
			inline: false,
		},
	);

	if (game.doubled) {
		embed.addFields({
			name: "Bet",
			value: `${(game.bet * 2).toLocaleString()} coins (doubled)`,
			inline: true,
		});
	} else {
		embed.addFields({
			name: "Bet",
			value: `${game.bet.toLocaleString()} coins`,
			inline: true,
		});
	}

	if (message) {
		embed.setDescription(message);
	}

	if (balance !== null) {
		embed.setFooter({ text: `Balance: ${balance.toLocaleString()} coins` });
	}

	return embed;
}

function buildActionRow(canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("bj_hit").setLabel("Hit").setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId("bj_stand").setLabel("Stand").setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId("bj_double")
			.setLabel("Double")
			.setStyle(ButtonStyle.Success)
			.setDisabled(!canDouble),
	);
}
