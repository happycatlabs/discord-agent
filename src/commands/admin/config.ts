import * as Sentry from "@sentry/node";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	UserSelectMenuBuilder,
} from "discord.js";
import { getServer, setChannel } from "../../lib/db/guild";
import {
	clearLogDestination,
	getLogDestinationSummary,
	LogCategory,
	setLogDestination,
} from "../../lib/db/guild/log-destinations";
import {
	getWhitelistedUsersForServer,
	removeUserFromWhitelist,
	whitelistUser,
} from "../../lib/db/guild/whitelist-user";

type Panel = "main" | "logging" | "whitelist";

const CATEGORY_LABELS: Record<LogCategory, string> = {
	[LogCategory.MESSAGES]: "Messages",
	[LogCategory.MEMBERS]: "Members",
	[LogCategory.MODERATION]: "Moderation",
	[LogCategory.VOICE]: "Voice",
	[LogCategory.INVITES]: "Invites",
	[LogCategory.ROLES]: "Roles",
};

const ALL_CATEGORIES = Object.values(LogCategory);

// Logging pages - categories grouped for pagination
// Page 0: Default + Messages + Members
// Page 1: Moderation + Voice + Invites
// Page 2: Roles
const LOGGING_PAGES: (LogCategory | "default")[][] = [
	["default", LogCategory.MESSAGES, LogCategory.MEMBERS],
	[LogCategory.MODERATION, LogCategory.VOICE, LogCategory.INVITES],
	[LogCategory.ROLES],
];

export const serverConfig = {
	data: new SlashCommandBuilder()
		.setName("config")
		.setDescription("Configure server settings")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction: any) {
		try {
			const serverId = interaction.guildId;

			if (!serverId) {
				await interaction.reply({
					content: "This command can only be used in a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			let _currentPanel: Panel = "main";
			let loggingPage = 0;

			const buildMainPanel = async () => {
				const summary = await getLogDestinationSummary({ serverId });
				const whitelistedUsers = await getWhitelistedUsersForServer({
					serverId,
				});

				const lines = [
					"## Server Configuration",
					"",
					"**Logging**",
					`Default Channel: ${summary.defaultChannel ? `<#${summary.defaultChannel}>` : "Not set"}`,
				];

				// Show category overrides
				if (summary.overrides.size > 0) {
					lines.push("", "Category Overrides:");
					for (const [category, channelId] of summary.overrides) {
						lines.push(`• ${CATEGORY_LABELS[category]}: <#${channelId}>`);
					}
				}

				// Categories using default
				const categoriesUsingDefault = ALL_CATEGORIES.filter((c) => !summary.overrides.has(c));
				if (categoriesUsingDefault.length > 0 && summary.defaultChannel) {
					lines.push(
						"",
						`-# ${categoriesUsingDefault.map((c) => CATEGORY_LABELS[c]).join(", ")} use default channel`,
					);
				}

				lines.push(
					"",
					"**AI Chat Whitelist**",
					whitelistedUsers.length > 0
						? `${whitelistedUsers.length} user${whitelistedUsers.length > 1 ? "s" : ""} whitelisted`
						: "No users whitelisted",
				);

				return lines.join("\n");
			};

			const buildLoggingPanel = async (page: number) => {
				const summary = await getLogDestinationSummary({ serverId });
				const pageCategories = LOGGING_PAGES[page];

				const lines = [
					"## Logging Configuration",
					"",
					`**Default Channel:** ${summary.defaultChannel ? `<#${summary.defaultChannel}>` : "Not set"}`,
				];

				// Show all overrides summary
				lines.push("", "**Current Overrides**");
				let hasOverrides = false;
				for (const category of ALL_CATEGORIES) {
					const override = summary.overrides.get(category);
					if (override) {
						lines.push(`• ${CATEGORY_LABELS[category]}: <#${override}>`);
						hasOverrides = true;
					}
				}
				if (!hasOverrides) {
					lines.push("-# No category overrides set");
				}

				// Current page info
				const pageLabels = pageCategories.map((c) =>
					c === "default" ? "Default" : CATEGORY_LABELS[c],
				);
				lines.push(
					"",
					`**Editing:** ${pageLabels.join(", ")}`,
					`-# Page ${page + 1}/${LOGGING_PAGES.length}`,
				);

				return lines.join("\n");
			};

			const buildWhitelistPanel = async () => {
				const whitelistedUsers = await getWhitelistedUsersForServer({
					serverId,
				});

				const lines = [
					"## AI Chat Whitelist",
					"",
					"Whitelisted users can chat with the AI in designated channels.",
				];

				if (whitelistedUsers.length > 0) {
					lines.push(
						"",
						"**Current Whitelist**",
						whitelistedUsers.map((id) => `<@${id}>`).join(", "),
					);
				} else {
					lines.push("", "-# No users are currently whitelisted");
				}

				lines.push("", "-# Use the selectors below to add or remove users");

				return lines.join("\n");
			};

			const buildMainButtons = (disabled: boolean) => {
				return new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId("config:panel:logging")
						.setLabel("Edit Logging")
						.setStyle(ButtonStyle.Primary)
						.setDisabled(disabled),
					new ButtonBuilder()
						.setCustomId("config:panel:whitelist")
						.setLabel("Edit Whitelist")
						.setStyle(ButtonStyle.Primary)
						.setDisabled(disabled),
				);
			};

			const channelTypes = [
				ChannelType.GuildText,
				ChannelType.GuildAnnouncement,
				ChannelType.PublicThread,
				ChannelType.PrivateThread,
			];

			const buildLoggingComponents = async (page: number, disabled: boolean) => {
				const rows: ActionRowBuilder<any>[] = [];
				const pageCategories = LOGGING_PAGES[page];
				const summary = await getLogDestinationSummary({ serverId });

				// Channel selects for this page's categories
				for (const category of pageCategories) {
					const placeholder =
						category === "default"
							? "Set default log channel"
							: `${CATEGORY_LABELS[category]} channel`;

					// Get currently configured channel for this category
					const currentChannel =
						category === "default"
							? summary.defaultChannel
							: (summary.overrides.get(category) ?? null);

					const selectMenu = new ChannelSelectMenuBuilder()
						.setCustomId(`config:log:${page}:${category}`)
						.setPlaceholder(placeholder)
						.setMinValues(0)
						.setMaxValues(1)
						.setChannelTypes(channelTypes)
						.setDisabled(disabled);

					// Explicitly set current value (or empty) to override Discord's UI cache
					if (currentChannel) {
						selectMenu.setDefaultChannels([currentChannel]);
					}

					rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(selectMenu));
				}

				// Clear buttons for this page
				const clearButtons = pageCategories.map((category) => {
					const label =
						category === "default" ? "Clear Default" : `Clear ${CATEGORY_LABELS[category]}`;
					return new ButtonBuilder()
						.setCustomId(`config:clear:${category}`)
						.setLabel(label)
						.setStyle(category === "default" ? ButtonStyle.Danger : ButtonStyle.Secondary)
						.setDisabled(disabled);
				});
				rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(clearButtons));

				// Navigation row
				const navButtons = [
					new ButtonBuilder()
						.setCustomId("config:log:prev")
						.setLabel("Previous")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(disabled || page === 0),
					new ButtonBuilder()
						.setCustomId("config:log:next")
						.setLabel("Next")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(disabled || page === LOGGING_PAGES.length - 1),
					new ButtonBuilder()
						.setCustomId("config:panel:main")
						.setLabel("Back")
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(disabled),
				];
				rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(navButtons));

				return rows;
			};

			const buildWhitelistComponents = (disabled: boolean) => {
				return [
					new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
						new UserSelectMenuBuilder()
							.setCustomId("config:whitelist:add")
							.setPlaceholder("Add user to whitelist")
							.setMinValues(1)
							.setMaxValues(1)
							.setDisabled(disabled),
					),
					new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
						new UserSelectMenuBuilder()
							.setCustomId("config:whitelist:remove")
							.setPlaceholder("Remove user from whitelist")
							.setMinValues(1)
							.setMaxValues(1)
							.setDisabled(disabled),
					),
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setCustomId("config:panel:main")
							.setLabel("Back")
							.setStyle(ButtonStyle.Secondary)
							.setDisabled(disabled),
					),
				];
			};

			// Initial response - main panel
			const { resource: response } = await interaction.reply({
				content: await buildMainPanel(),
				components: [buildMainButtons(false)],
				flags: [MessageFlags.Ephemeral],
				withResponse: true,
			});

			const collector = response.message.createMessageComponentCollector({
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

				// Logging pagination
				if (i.customId === "config:log:prev") {
					loggingPage = Math.max(0, loggingPage - 1);
					await i.update({
						content: await buildLoggingPanel(loggingPage),
						components: await buildLoggingComponents(loggingPage, false),
					});
					return;
				}

				if (i.customId === "config:log:next") {
					loggingPage = Math.min(LOGGING_PAGES.length - 1, loggingPage + 1);
					await i.update({
						content: await buildLoggingPanel(loggingPage),
						components: await buildLoggingComponents(loggingPage, false),
					});
					return;
				}

				// Panel navigation
				if (i.customId.startsWith("config:panel:")) {
					const panel = i.customId.split(":")[2] as Panel;
					_currentPanel = panel;

					if (panel === "main") {
						await i.update({
							content: await buildMainPanel(),
							components: [buildMainButtons(false)],
						});
					} else if (panel === "logging") {
						loggingPage = 0; // Reset to first page
						await i.update({
							content: await buildLoggingPanel(loggingPage),
							components: await buildLoggingComponents(loggingPage, false),
						});
					} else if (panel === "whitelist") {
						await i.update({
							content: await buildWhitelistPanel(),
							components: buildWhitelistComponents(false),
						});
					}
					return;
				}

				// Channel select handling
				if (i.isChannelSelectMenu() && i.customId.startsWith("config:log:")) {
					// customId format: config:log:${page}:${category}
					const target = i.customId.split(":")[3];
					const selectedChannelId = i.values[0];

					if (!selectedChannelId) {
						// User cleared the selection - just acknowledge
						await i.deferUpdate();
						return;
					}

					const channel = await i.guild?.channels.fetch(selectedChannelId).catch(() => null);

					if (!channel || !channel.isTextBased()) {
						await i.reply({
							content: "Please select a text-based channel.",
							flags: [MessageFlags.Ephemeral],
						});
						return;
					}

					if (target === "default") {
						// Set default log channel
						const server = await getServer({ serverId });
						if (server) {
							await setChannel({
								channel: { id: channel.id, name: channel.name },
								server,
							});
						}
					} else {
						// Set category-specific channel
						const category = target as LogCategory;
						if (ALL_CATEGORIES.includes(category)) {
							setLogDestination({
								serverId,
								category,
								channelId: channel.id,
							});
						}
					}

					await i.update({
						content: await buildLoggingPanel(loggingPage),
						components: await buildLoggingComponents(loggingPage, false),
					});
					return;
				}

				// Clear button handling
				if (i.isButton() && i.customId.startsWith("config:clear:")) {
					const target = i.customId.split(":")[2];

					if (target === "default") {
						// Clear default log channel - set to empty
						const server = await getServer({ serverId });
						if (server) {
							await setChannel({
								channel: { id: "", name: "" },
								server,
							});
						}
					} else {
						// Clear category-specific channel
						const category = target as LogCategory;
						if (ALL_CATEGORIES.includes(category)) {
							clearLogDestination({ serverId, category });
						}
					}

					await i.update({
						content: await buildLoggingPanel(loggingPage),
						components: await buildLoggingComponents(loggingPage, false),
					});
					return;
				}

				// Whitelist user select handling
				if (i.isUserSelectMenu()) {
					const selectedUserId = i.values[0];

					if (i.customId === "config:whitelist:add") {
						await whitelistUser({ userId: selectedUserId, serverId });
						await i.update({
							content: await buildWhitelistPanel(),
							components: buildWhitelistComponents(false),
						});
					} else if (i.customId === "config:whitelist:remove") {
						await removeUserFromWhitelist({ userId: selectedUserId, serverId });
						await i.update({
							content: await buildWhitelistPanel(),
							components: buildWhitelistComponents(false),
						});
					}
					return;
				}
			});

			collector.on("end", async () => {
				// Disable all components when collector ends
				await response.message
					.edit({
						components: [buildMainButtons(true)],
					})
					.catch(() => {});
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing config command:", error);
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
