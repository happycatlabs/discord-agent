import * as Sentry from "@sentry/bun";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
	TextDisplayBuilder,
} from "discord.js";
import { ComponentType as ApiComponentType } from "discord-api-types/v10";
import { FEATURE_BETTING } from "../../lib/constants/flags";
import {
	getEconomyConfig,
	getOrCreateUserEconomy,
	setUserCoins,
	updateEconomyConfig,
	updateUserCoins,
} from "../../lib/db/economy";
import { applyRoleReward, awardXpWithGain, sendLevelUpAnnouncement } from "../../lib/economy/xp";

const GENERAL_CONFIG_MODAL_ID = "general-config-modal";
const XP_CONFIG_MODAL_ID = "xp-config-modal";
const DAILY_CONFIG_MODAL_ID = "daily-config-modal";
const BETTING_CONFIG_MODAL_ID = "betting-config-modal";

export const economyAdmin = {
	data: new SlashCommandBuilder()
		.setName("economy")
		.setDescription("Economy administration commands")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((sub) =>
			sub
				.setName("set")
				.setDescription("Set a user's coin balance")
				.addUserOption((option) =>
					option.setName("user").setDescription("The user").setRequired(true),
				)
				.addIntegerOption((option) =>
					option
						.setName("coins")
						.setDescription("The amount of coins")
						.setRequired(true)
						.setMinValue(0),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("give")
				.setDescription("Give coins or XP to a user")
				.addUserOption((option) =>
					option.setName("user").setDescription("The user").setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("type")
						.setDescription("What to give")
						.setRequired(true)
						.addChoices({ name: "Coins", value: "coins" }, { name: "XP", value: "xp" }),
				)
				.addIntegerOption((option) =>
					option
						.setName("amount")
						.setDescription("The amount to give")
						.setRequired(true)
						.setMinValue(1),
				),
		)
		.addSubcommand((sub) =>
			sub
				.setName("take")
				.setDescription("Take coins from a user")
				.addUserOption((option) =>
					option.setName("user").setDescription("The user").setRequired(true),
				)
				.addIntegerOption((option) =>
					option
						.setName("coins")
						.setDescription("The amount of coins to take")
						.setRequired(true)
						.setMinValue(1),
				),
		)
		.addSubcommand((sub) => {
			sub.setName("config").setDescription("Configure economy settings");
			return sub;
		}),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;
			const subcommand = interaction.options.getSubcommand();
			const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			// Every subcommand creates or changes balances, so all of them are admin-only.
			if (!isAdmin) {
				await interaction.reply({
					content: "Only administrators can use economy admin commands.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			switch (subcommand) {
				case "set": {
					const targetUser = interaction.options.getUser("user");
					const coins = interaction.options.getInteger("coins");

					getOrCreateUserEconomy({ serverId, userId: targetUser.id });
					setUserCoins({ serverId, userId: targetUser.id, coins });

					await interaction.reply({
						content: `Set <@${targetUser.id}>'s balance to **${coins.toLocaleString()}** coins.`,
						flags: [MessageFlags.Ephemeral],
					});
					break;
				}

				case "give": {
					const targetUser = interaction.options.getUser("user");
					const type = interaction.options.getString("type");
					const amount = interaction.options.getInteger("amount");

					getOrCreateUserEconomy({ serverId, userId: targetUser.id });

					if (type === "coins") {
						updateUserCoins({
							serverId,
							userId: targetUser.id,
							amount,
							trackTotal: true,
						});
						const user = getOrCreateUserEconomy({ serverId, userId: targetUser.id });
						await interaction.reply({
							content: `Gave <@${targetUser.id}> **${amount.toLocaleString()}** coins. New balance: **${user.coins.toLocaleString()}**`,
							flags: [MessageFlags.Ephemeral],
						});
					} else {
						const xpResult = awardXpWithGain({
							serverId,
							userId: targetUser.id,
							xpGain: amount,
							updateLastXpAt: false,
						});

						if (!xpResult) {
							await interaction.reply({
								content: "Economy is disabled for this server.",
								flags: [MessageFlags.Ephemeral],
							});
							return;
						}

						let levelUpMessage = "";
						if (xpResult.leveledUp && interaction.guild) {
							const config = getEconomyConfig({ serverId });

							// Send level-up announcement
							await sendLevelUpAnnouncement({
								guild: interaction.guild,
								userId: targetUser.id,
								newLevel: xpResult.newLevel,
								channelId: config.levelup_channel_id,
							});

							// Apply role reward if any
							if (xpResult.roleId) {
								await applyRoleReward({
									guild: interaction.guild,
									userId: targetUser.id,
									roleId: xpResult.roleId,
								});
							}

							levelUpMessage = ` Leveled up to **${xpResult.newLevel}**!`;
						}

						await interaction.reply({
							content: `Gave <@${targetUser.id}> **${amount.toLocaleString()}** XP. New total: **${xpResult.newXp.toLocaleString()}** XP (Level ${xpResult.newLevel})${levelUpMessage}`,
							flags: [MessageFlags.Ephemeral],
						});
					}
					break;
				}

				case "take": {
					const targetUser = interaction.options.getUser("user");
					const coins = interaction.options.getInteger("coins");

					getOrCreateUserEconomy({ serverId, userId: targetUser.id });
					updateUserCoins({
						serverId,
						userId: targetUser.id,
						amount: -coins,
						trackTotal: false,
					});

					const user = getOrCreateUserEconomy({ serverId, userId: targetUser.id });

					await interaction.reply({
						content: `Took **${coins.toLocaleString()}** coins from <@${targetUser.id}>. New balance: **${user.coins.toLocaleString()}**`,
						flags: [MessageFlags.Ephemeral],
					});
					break;
				}

				case "config": {
					const config = getEconomyConfig({ serverId });

					// Show config panel with buttons
					await interaction.reply({
						content: buildFullConfigSummary(config),
						components: [
							buildConfigButtons(false, interaction.user.id),
							...buildChannelConfigComponents(false),
						],
						flags: [MessageFlags.Ephemeral],
					});
					const response = await interaction.fetchReply();

					const collector = response.createMessageComponentCollector({
						time: 300000, // 5 minutes
					});

					collector.on("collect", async (i: any) => {
						if (i.user.id !== interaction.user.id) {
							await i.reply({
								content: "You can't use these controls.",
								flags: [MessageFlags.Ephemeral],
							});
							return;
						}

						// Handle channel select menus
						if (i.isChannelSelectMenu()) {
							const selected = i.values[0];
							const channel = await i.guild?.channels.fetch(selected).catch(() => null);
							if (!channel || !channel.isTextBased()) {
								await i.reply({
									content: "Please select a text-based channel.",
									flags: [MessageFlags.Ephemeral],
								});
								return;
							}

							const field = channelSelectFieldMap[i.customId];
							if (field) {
								updateEconomyConfig({
									serverId,
									updates: { [field]: channel.id },
								});
								const latest = getEconomyConfig({ serverId });
								await i.update({
									content: buildFullConfigSummary(latest),
									components: [
										buildConfigButtons(false, interaction.user.id),
										...buildChannelConfigComponents(false),
									],
								});
							}
							return;
						}

						// Handle buttons
						if (i.isButton()) {
							const currentConfig = getEconomyConfig({ serverId });

							// Clear channel buttons
							const clearField = channelClearFieldMap[i.customId];
							if (clearField) {
								updateEconomyConfig({
									serverId,
									updates: { [clearField]: null },
								});
								const latest = getEconomyConfig({ serverId });
								await i.update({
									content: buildFullConfigSummary(latest),
									components: [
										buildConfigButtons(false, interaction.user.id),
										...buildChannelConfigComponents(false),
									],
								});
								return;
							}

							// General config button
							if (i.customId.startsWith("economy-config:general:")) {
								// Use raw modal payload since discord.js doesn't have a
								// CheckboxBuilder yet. showModal() accepts raw API data.
								const generalModalCustomId = `${GENERAL_CONFIG_MODAL_ID}:${i.user.id}`;
								await i.showModal({
									custom_id: generalModalCustomId,
									title: "General Settings",
									components: [
										{
											type: ApiComponentType.Label,
											label: "Economy Status",
											description: "Enable or disable the economy system",
											component: {
												type: ApiComponentType.Checkbox,
												custom_id: "general-enabled",
												label: "Enabled",
												default: currentConfig.enabled === 1,
											},
										},
									],
								});

								const submission = await i
									.awaitModalSubmit({
										filter: (m: any) => m.customId === generalModalCustomId,
										time: 120000,
									})
									.catch(() => null);

								if (submission) {
									const enabledField = submission.fields.getField("general-enabled");
									const enabled = enabledField.value === true ? 1 : 0;
									updateEconomyConfig({
										serverId,
										updates: { enabled },
									});
									const latest = getEconomyConfig({ serverId });
									await submission.update({
										content: buildFullConfigSummary(latest),
										components: [
											buildConfigButtons(false, interaction.user.id),
											...buildChannelConfigComponents(false),
										],
									});
								}
								return;
							}

							// XP config button
							if (i.customId.startsWith("economy-config:xp:")) {
								const xpModal = new ModalBuilder()
									.setCustomId(`${XP_CONFIG_MODAL_ID}:${i.user.id}`)
									.setTitle("XP Settings");

								const xpMinSelect = new StringSelectMenuBuilder()
									.setCustomId("xp-min")
									.setRequired(true)
									.addOptions(generateNumberOptions(XP_VALUES, currentConfig.xp_min));

								const xpMinLabel = new LabelBuilder()
									.setLabel("Minimum XP per message")
									.setStringSelectMenuComponent(xpMinSelect);

								const xpMaxSelect = new StringSelectMenuBuilder()
									.setCustomId("xp-max")
									.setRequired(true)
									.addOptions(generateNumberOptions(XP_VALUES, currentConfig.xp_max));

								const xpMaxLabel = new LabelBuilder()
									.setLabel("Maximum XP per message")
									.setStringSelectMenuComponent(xpMaxSelect);

								const cooldownSelect = new StringSelectMenuBuilder()
									.setCustomId("xp-cooldown")
									.setRequired(true)
									.addOptions(
										generateNumberOptions(COOLDOWN_VALUES, currentConfig.xp_cooldown_seconds, "s"),
									);

								const cooldownLabel = new LabelBuilder()
									.setLabel("Cooldown between XP gains")
									.setStringSelectMenuComponent(cooldownSelect);

								xpModal.addLabelComponents(xpMinLabel, xpMaxLabel, cooldownLabel);
								await i.showModal(xpModal);

								const submission = await i
									.awaitModalSubmit({
										filter: (m: any) => m.customId === `${XP_CONFIG_MODAL_ID}:${i.user.id}`,
										time: 120000,
									})
									.catch(() => null);

								if (submission) {
									const xpMin = Number.parseInt(
										submission.fields.getStringSelectValues("xp-min")[0],
										10,
									);
									const xpMax = Number.parseInt(
										submission.fields.getStringSelectValues("xp-max")[0],
										10,
									);
									const cooldown = Number.parseInt(
										submission.fields.getStringSelectValues("xp-cooldown")[0],
										10,
									);

									if (xpMin > xpMax) {
										await submission.reply({
											content: "Minimum XP cannot be greater than maximum XP.",
											flags: [MessageFlags.Ephemeral],
										});
										return;
									}

									updateEconomyConfig({
										serverId,
										updates: {
											xp_min: xpMin,
											xp_max: xpMax,
											xp_cooldown_seconds: cooldown,
										},
									});
									const latest = getEconomyConfig({ serverId });
									await submission.update({
										content: buildFullConfigSummary(latest),
										components: [
											buildConfigButtons(false, interaction.user.id),
											...buildChannelConfigComponents(false),
										],
									});
								}
								return;
							}

							// Daily rewards config button
							if (i.customId.startsWith("economy-config:daily:")) {
								const dailyModal = new ModalBuilder()
									.setCustomId(`${DAILY_CONFIG_MODAL_ID}:${i.user.id}`)
									.setTitle("/daily Command Settings");

								const explainerText = new TextDisplayBuilder().setContent(
									"Configure the reward range for the `/daily` command.\n-# Users get a random amount within these ranges, plus streak bonuses.",
								);

								const coinsMinSelect = new StringSelectMenuBuilder()
									.setCustomId("daily-coins-min")
									.setRequired(true)
									.addOptions(generateNumberOptions(COIN_VALUES, currentConfig.daily_coins_min));

								const coinsMinLabel = new LabelBuilder()
									.setLabel("Min coins")
									.setStringSelectMenuComponent(coinsMinSelect);

								const coinsMaxSelect = new StringSelectMenuBuilder()
									.setCustomId("daily-coins-max")
									.setRequired(true)
									.addOptions(generateNumberOptions(COIN_VALUES, currentConfig.daily_coins_max));

								const coinsMaxLabel = new LabelBuilder()
									.setLabel("Max coins")
									.setStringSelectMenuComponent(coinsMaxSelect);

								const xpMinSelect = new StringSelectMenuBuilder()
									.setCustomId("daily-xp-min")
									.setRequired(true)
									.addOptions(generateNumberOptions(DAILY_XP_VALUES, currentConfig.daily_xp_min));

								const xpMinLabel = new LabelBuilder()
									.setLabel("Min XP")
									.setStringSelectMenuComponent(xpMinSelect);

								const xpMaxSelect = new StringSelectMenuBuilder()
									.setCustomId("daily-xp-max")
									.setRequired(true)
									.addOptions(generateNumberOptions(DAILY_XP_VALUES, currentConfig.daily_xp_max));

								const xpMaxLabel = new LabelBuilder()
									.setLabel("Max XP")
									.setStringSelectMenuComponent(xpMaxSelect);

								dailyModal
									.addTextDisplayComponents(explainerText)
									.addLabelComponents(coinsMinLabel, coinsMaxLabel, xpMinLabel, xpMaxLabel);
								await i.showModal(dailyModal);

								const submission = await i
									.awaitModalSubmit({
										filter: (m: any) => m.customId === `${DAILY_CONFIG_MODAL_ID}:${i.user.id}`,
										time: 120000,
									})
									.catch(() => null);

								if (submission) {
									const coinsMin = Number.parseInt(
										submission.fields.getStringSelectValues("daily-coins-min")[0],
										10,
									);
									const coinsMax = Number.parseInt(
										submission.fields.getStringSelectValues("daily-coins-max")[0],
										10,
									);
									const xpMin = Number.parseInt(
										submission.fields.getStringSelectValues("daily-xp-min")[0],
										10,
									);
									const xpMax = Number.parseInt(
										submission.fields.getStringSelectValues("daily-xp-max")[0],
										10,
									);

									const errors: string[] = [];
									if (coinsMin > coinsMax) errors.push("Min coins cannot exceed max coins");
									if (xpMin > xpMax) errors.push("Min XP cannot exceed max XP");

									if (errors.length > 0) {
										await submission.reply({
											content: errors.join("\n"),
											flags: [MessageFlags.Ephemeral],
										});
										return;
									}

									updateEconomyConfig({
										serverId,
										updates: {
											daily_coins_min: coinsMin,
											daily_coins_max: coinsMax,
											daily_xp_min: xpMin,
											daily_xp_max: xpMax,
										},
									});
									const latest = getEconomyConfig({ serverId });
									await submission.update({
										content: buildFullConfigSummary(latest),
										components: [
											buildConfigButtons(false, interaction.user.id),
											...buildChannelConfigComponents(false),
										],
									});
								}
								return;
							}

							// Betting config button
							if (i.customId.startsWith("economy-config:betting:")) {
								const bettingModal = new ModalBuilder()
									.setCustomId(`${BETTING_CONFIG_MODAL_ID}:${i.user.id}`)
									.setTitle("Betting Settings");

								const minBetSelect = new StringSelectMenuBuilder()
									.setCustomId("betting-min")
									.setRequired(true)
									.addOptions(generateNumberOptions(BET_MIN_VALUES, currentConfig.min_bet));

								const minBetLabel = new LabelBuilder()
									.setLabel("Minimum bet amount")
									.setStringSelectMenuComponent(minBetSelect);

								const maxBetSelect = new StringSelectMenuBuilder()
									.setCustomId("betting-max")
									.setRequired(true)
									.addOptions(generateNumberOptions(BET_MAX_VALUES, currentConfig.max_bet));

								const maxBetLabel = new LabelBuilder()
									.setLabel("Maximum bet amount")
									.setStringSelectMenuComponent(maxBetSelect);

								bettingModal.addLabelComponents(minBetLabel, maxBetLabel);
								await i.showModal(bettingModal);

								const submission = await i
									.awaitModalSubmit({
										filter: (m: any) => m.customId === `${BETTING_CONFIG_MODAL_ID}:${i.user.id}`,
										time: 120000,
									})
									.catch(() => null);

								if (submission) {
									const minBet = Number.parseInt(
										submission.fields.getStringSelectValues("betting-min")[0],
										10,
									);
									const maxBet = Number.parseInt(
										submission.fields.getStringSelectValues("betting-max")[0],
										10,
									);

									if (minBet > maxBet) {
										await submission.reply({
											content: "Minimum bet cannot be greater than maximum bet.",
											flags: [MessageFlags.Ephemeral],
										});
										return;
									}

									updateEconomyConfig({
										serverId,
										updates: { min_bet: minBet, max_bet: maxBet },
									});
									const latest = getEconomyConfig({ serverId });
									await submission.update({
										content: buildFullConfigSummary(latest),
										components: [
											buildConfigButtons(false, interaction.user.id),
											...buildChannelConfigComponents(false),
										],
									});
								}
								return;
							}
						}
					});

					collector.on("end", async () => {
						await response
							.edit({
								components: [
									buildConfigButtons(true, interaction.user.id),
									...buildChannelConfigComponents(true),
								],
							})
							.catch(() => {});
					});
					break;
				}
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing economy admin command:", error);
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

const channelSelectFieldMap: Record<
	string,
	"levelup_channel_id" | "leaderboard_channel_id" | "casino_channel_id"
> = {
	"economy-channel:levelup": "levelup_channel_id",
	"economy-channel:leaderboard": "leaderboard_channel_id",
	"economy-channel:casino": "casino_channel_id",
};

const channelClearFieldMap: Record<
	string,
	"levelup_channel_id" | "leaderboard_channel_id" | "casino_channel_id"
> = {
	"economy-clear:levelup": "levelup_channel_id",
	"economy-clear:leaderboard": "leaderboard_channel_id",
	"economy-clear:casino": "casino_channel_id",
};

const buildFullConfigSummary = (config: {
	enabled: number;
	xp_min: number;
	xp_max: number;
	xp_cooldown_seconds: number;
	daily_coins_min: number;
	daily_coins_max: number;
	daily_xp_min: number;
	daily_xp_max: number;
	min_bet: number;
	max_bet: number;
	levelup_channel_id: string | null;
	leaderboard_channel_id: string | null;
	casino_channel_id: string | null;
}): string => {
	const lines = [
		"## Current Configuration",
		"",
		`**Status:** ${config.enabled ? "Enabled" : "Disabled"}`,
		"",
		"**XP Settings**",
		`• XP per message: ${config.xp_min} - ${config.xp_max}`,
		`• Cooldown: ${config.xp_cooldown_seconds}s`,
		"",
		"**/daily command**",
		`• Coins: ${config.daily_coins_min} - ${config.daily_coins_max}`,
		`• XP: ${config.daily_xp_min} - ${config.daily_xp_max}`,
	];

	if (FEATURE_BETTING) {
		lines.push(
			"",
			"**Betting**",
			`• Min bet: ${config.min_bet}`,
			`• Max bet: ${config.max_bet.toLocaleString()}`,
		);
	}

	lines.push(
		"",
		"**Channels**",
		`• Level-up: ${config.levelup_channel_id ? `<#${config.levelup_channel_id}>` : "Not set"}`,
		`• Leaderboard: ${config.leaderboard_channel_id ? `<#${config.leaderboard_channel_id}>` : "Not set"}`,
		`• Casino: ${config.casino_channel_id ? `<#${config.casino_channel_id}>` : "Not set"}`,
	);

	return lines.join("\n");
};

// Generate number options for dropdowns
const generateNumberOptions = (values: number[], currentValue: number, labelSuffix = "") => {
	return values.map((v) => ({
		label: `${v}${labelSuffix}`,
		value: v.toString(),
		default: v === currentValue,
	}));
};

// Common XP values (per message)
const XP_VALUES = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50];
// Daily XP values (higher since it's once per day)
const DAILY_XP_VALUES = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
// Common cooldown values in seconds
const COOLDOWN_VALUES = [0, 15, 30, 45, 60, 90, 120, 180, 300, 600];
// Common coin values
const COIN_VALUES = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
// Common bet values
const BET_MIN_VALUES = [1, 5, 10, 25, 50, 100];
const BET_MAX_VALUES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

const buildConfigButtons = (disabled: boolean, userId: string) => {
	const buttons = [
		new ButtonBuilder()
			.setCustomId(`economy-config:general:${userId}`)
			.setLabel("General")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(`economy-config:xp:${userId}`)
			.setLabel("XP Settings")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId(`economy-config:daily:${userId}`)
			.setLabel("/daily")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(disabled),
	];

	if (FEATURE_BETTING) {
		buttons.push(
			new ButtonBuilder()
				.setCustomId(`economy-config:betting:${userId}`)
				.setLabel("Betting")
				.setStyle(ButtonStyle.Primary)
				.setDisabled(disabled),
		);
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
};

const buildChannelConfigComponents = (disabled: boolean) => {
	const channelTypes = [
		ChannelType.GuildText,
		ChannelType.GuildAnnouncement,
		ChannelType.GuildForum,
	];

	const levelupRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
		new ChannelSelectMenuBuilder()
			.setCustomId("economy-channel:levelup")
			.setPlaceholder("Select level-up channel")
			.setMinValues(1)
			.setMaxValues(1)
			.setChannelTypes(channelTypes)
			.setDisabled(disabled),
	);

	const leaderboardRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
		new ChannelSelectMenuBuilder()
			.setCustomId("economy-channel:leaderboard")
			.setPlaceholder("Select leaderboard channel")
			.setMinValues(1)
			.setMaxValues(1)
			.setChannelTypes(channelTypes)
			.setDisabled(disabled),
	);

	const casinoRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
		new ChannelSelectMenuBuilder()
			.setCustomId("economy-channel:casino")
			.setPlaceholder("Select casino channel")
			.setMinValues(1)
			.setMaxValues(1)
			.setChannelTypes(channelTypes)
			.setDisabled(disabled),
	);

	const clearButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("economy-clear:levelup")
			.setLabel("Clear Level-up")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId("economy-clear:leaderboard")
			.setLabel("Clear Leaderboard")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
		new ButtonBuilder()
			.setCustomId("economy-clear:casino")
			.setLabel("Clear Casino")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(disabled),
	);

	return [levelupRow, leaderboardRow, casinoRow, clearButtonRow];
};
