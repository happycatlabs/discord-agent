import * as Sentry from "@sentry/node";
import {
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	PermissionsBitField,
	SlashCommandBuilder,
} from "discord.js";
import { BOT_NAME } from "../../../lib/constants";
import { createServer } from "../../../lib/db/guild";
import { createUsers } from "../../../lib/db/user";
import { formatDate, getServerProperties, getUserProperties } from "../../../lib/util";

export const initBotInServer = {
	data: new SlashCommandBuilder()
		.setName("init")
		.setDescription("Initialize the bot in the server.")
		.addChannelOption((option) =>
			option
				.setName("channel")
				.setDescription("The channel to log changes in.")
				.setRequired(true)
				.addChannelTypes(
					ChannelType.GuildText,
					ChannelType.GuildAnnouncement,
					ChannelType.GuildForum,
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction: any) {
		try {
			const guild = interaction.guild;

			if (!interaction.inGuild() || !guild) {
				await interaction.reply({
					content: "This command can only be used inside a server.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const logChannel = interaction.options.getChannel("channel");
			const logChannelId = logChannel.id;
			const botMember = guild.members.me ?? (await guild.members.fetchMe({ cache: true }));
			const {
				hasAccess: logAccessConfirmed,
				autoGranted: logAccessAutoGranted,
				missingPermissionLabels,
			} = await ensureBotCanAccessLogChannel({
				logChannel,
				botMember,
			});

			if (!logAccessConfirmed) {
				await interaction.reply({
					content: `I couldn't access ${logChannel} automatically. Please grant the bot: ${missingPermissionLabels.join(", ")} and run /init again.`,
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const server = getServerProperties({
				server: guild,
			});
			const members = await guild.members.fetch({ cache: false });

			const { success, initializedAt, exists } = await createServer(
				{
					...server,
					logChannel: logChannelId,
				},
				true,
			);

			let statusMessage = "Initialization failed.";
			if (success) {
				if (exists) {
					statusMessage = "Successfully updated existing configuration.";
				} else {
					statusMessage = "Successfully initialized.";
				}
			}

			const cleanMembers = members.map((member: any) => {
				return getUserProperties({ userObject: member.user });
			});
			const { stored, updated } = await createUsers({
				users: cleanMembers,
				server,
				update: true,
			});

			const creationMessage = getCreationMessage(stored, updated, guild.name);

			const embed = new EmbedBuilder()
				.setColor(0x0099ff)
				.setTitle(`${BOT_NAME}`)
				.setDescription(`Ready to monitor **${guild.name}**.`)
				.addFields(
					{
						name: "Initialization Status",
						value: statusMessage, // Updated status message logic
						inline: true,
					},
					{
						name: "Initialization Date",
						value: formatDate(initializedAt || new Date().toISOString(), {
							short: true,
						}),
						inline: true,
					},
					{
						name: "Log Channel",
						value: `${logChannel} — ${
							logAccessAutoGranted ? "Access granted automatically." : "Access confirmed."
						}`,
						inline: true,
					},
					{ name: "Server Members Processed", value: creationMessage },
				)
				.setTimestamp();

			await interaction.reply({
				embeds: [embed],
				flags: [MessageFlags.Ephemeral],
			});
		} catch (error) {
			Sentry.captureException(error);
			console.error("Error executing init command:", error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content:
						"An error occurred while initializing the bot. Please check the console for details.",
					flags: [MessageFlags.Ephemeral],
				});
			} else {
				await interaction.reply({
					content:
						"An error occurred while initializing the bot. Please check the console for details.",
					flags: [MessageFlags.Ephemeral],
				});
			}
			throw error;
		}
	},
};

async function ensureBotCanAccessLogChannel({
	logChannel,
	botMember,
}: {
	logChannel: any;
	botMember: any;
}) {
	const requiredPermissions = [
		{
			flag: PermissionsBitField.Flags.ViewChannel,
			label: "View Channel",
		},
		{
			flag: PermissionsBitField.Flags.SendMessages,
			label: "Send Messages",
		},
		{
			flag: PermissionsBitField.Flags.SendMessagesInThreads,
			label: "Send Messages in Threads",
		},
		{
			flag: PermissionsBitField.Flags.EmbedLinks,
			label: "Embed Links",
		},
	] as const;

	const getMissingPermissions = () => {
		const channelPermissions = logChannel.permissionsFor(botMember);
		if (!channelPermissions) {
			return requiredPermissions;
		}
		return requiredPermissions.filter(({ flag }) => !channelPermissions.has(flag));
	};

	let missingPermissions = getMissingPermissions();
	let autoGranted = false;

	if (missingPermissions.length > 0) {
		const hasManageRoles =
			botMember.permissions.has(PermissionsBitField.Flags.Administrator) ||
			botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);

		if (hasManageRoles) {
			try {
				await logChannel.permissionOverwrites.edit(
					botMember,
					{
						ViewChannel: true,
						SendMessages: true,
						SendMessagesInThreads: true,
						EmbedLinks: true,
					},
					{ reason: "Auto-configuring log channel via /init" },
				);
				autoGranted = true;
				missingPermissions = getMissingPermissions();
			} catch (error) {
				Sentry.captureException(error);
				console.error("Failed to auto-configure log channel permissions:", error);
			}
		}
	}

	return {
		hasAccess: missingPermissions.length === 0,
		autoGranted,
		missingPermissionLabels: missingPermissions.map(({ label }) => label),
	};
}

function getCreationMessage(stored: number, updated: number, _guild: string) {
	let message = "";
	if (stored > 0) {
		message += `Stored ${stored} new users.`;
	}
	if (updated > 0) {
		if (stored === 0) {
			message += ` Updated ${updated} users.`;
		} else {
			message += ` \nUpdated ${updated} users.`;
		}
	}
	return message || "No new users stored or updated.";
}
