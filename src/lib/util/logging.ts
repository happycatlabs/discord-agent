import {
	type ClientUser,
	type ColorResolvable,
	EmbedBuilder,
	type GuildTextBasedChannel,
	type Message,
	type Presence,
	type VoiceState,
} from "discord.js";

import dayjs from "dayjs";
import { getUserProperties } from ".";
import { DISCORD_CLIENT } from "../..";
import { getServer } from "../db/guild";
import { checkIfUserIsIgnored } from "../db/guild/ignore-user";
import { type LogCategory, getLogDestination } from "../db/guild/log-destinations";
import type { User } from "../types/user";

export { LogCategory } from "../db/guild/log-destinations";

interface SendMessageToLogChannelOptions {
	event: any;
	serverId?: string;
	embed: EmbedBuilder;
	reference?: boolean;
	category?: LogCategory;
}

interface SendTextToLogChannelOptions {
	event: any;
	serverId: string;
	content: string;
	reference?: boolean;
}

export async function sendMessageToLogChannel({
	serverId,
	embed,
	reference,
	category,
}: SendMessageToLogChannelOptions): Promise<void> {
	if (!serverId) {
		console.error("No server provided. Cannot log to channel.");
		return;
	}

	if (!embed) {
		console.error("No embed provided. Cannot log to channel.");
		return;
	}

	// Get the log channel - either category-specific or default
	let logChannelId: string | null = null;

	if (category) {
		// Use category-specific destination (falls back to default internally)
		logChannelId = await getLogDestination({ serverId, category });
	} else {
		// No category specified, use the default log channel
		const server = await getServer({ serverId }).catch((err) => {
			console.error("Error retrieving server:", err);
			return null;
		});
		logChannelId = server?.logChannel ?? null;
	}

	if (!logChannelId) {
		// No log channel configured - silently skip
		return;
	}
	const agent = DISCORD_CLIENT.user as ClientUser;
	embed.setTimestamp().setFooter({
		text: agent?.username || "Unknown User",
		iconURL: agent?.avatarURL() || "",
	});

	try {
		const channel = DISCORD_CLIENT.channels.cache.get(logChannelId) as GuildTextBasedChannel;

		if (!channel) {
			console.error("Log channel not found in guild.", logChannelId);
			return;
		}

		if (reference) {
			const messages = await channel.messages.fetch({ limit: 1 });
			const lastMessage = messages.first();

			if (lastMessage) {
				await lastMessage.reply({ embeds: [embed] });
				return;
			}
		}

		await channel.send({ embeds: [embed] });
	} catch (error) {
		console.error("An error occurred while sending message to log channel:", error);
	}
}

export async function sendTextToLogChannel({
	event,
	serverId,
	content,
	reference,
}: SendTextToLogChannelOptions): Promise<void> {
	if (!serverId) {
		console.error("No server provided. Cannot log to channel.");
		return;
	}

	if (!content) {
		console.error("No content provided. Cannot log to channel.");
		return;
	}

	const server = await getServer({ serverId }).catch((err) => {
		console.error("Error retrieving server:", err);
		return null;
	});

	if (!server?.logChannel) {
		console.error("No log channel found. Cannot log to channel.");
		return;
	}

	const logChannelId = server.logChannel;

	try {
		const channel = event.guild?.channels.cache.get(logChannelId) as GuildTextBasedChannel;

		if (!channel) {
			console.error("Log channel not found in guild.", logChannelId);
			return;
		}

		if (reference) {
			const messages = await channel.messages.fetch({ limit: 1 });
			const lastMessage = messages.first();

			if (lastMessage) {
				await lastMessage.reply({ content });
				return;
			}
		}

		await channel.send({ content });
	} catch (error) {
		console.error("An error occurred while sending text message to log channel:", error);
	}
}

const checkMessageValidity = (message: Message) => {
	const timestamp = dayjs().format("YYYY-MM-DD HH:mm:ss");
	if (!message) {
		console.error("Invalid message event: Message is undefined", {
			id: "Unknown",
			timestamp,
		});
		return false;
	}

	if (!message.guild) {
		console.error("Invalid message event: Message guild is undefined", {
			id: message?.id || "Unknown",
			timestamp,
		});
		return false;
	}

	if (!message.channel) {
		console.error("Invalid message event: Message channel is undefined", {
			id: message?.id || "Unknown",

			timestamp,
		});
		return false;
	}

	return true;
};

export const logMessageEvent = async ({
	message,
	fields = [],
	color = "Random",
	type = "edit",
	category,
}: {
	message: Message;
	fields?: { name: string; value: string }[];
	color?: ColorResolvable;
	type?: "edit" | "delete";
	category?: LogCategory;
}) => {
	const valid = checkMessageValidity(message);

	if (!valid || !message?.guild) return;

	const embedColor = (type === "delete" ? "Red" : color) as ColorResolvable;
	const title = type === "edit" ? "Message edited" : "Message deleted";
	const description =
		type === "edit" && message.content
			? `[Jump to message](https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id})`
			: message.content || "No content";
	const attachments =
		message.attachments.size > 0
			? message.attachments.map((attachment) => ({
					name: "Attachment",
					value: `[${attachment.name}](${attachment.url}) (might be unavailable)`,
				}))
			: [];

	if (!message.author) return;

	const embed = new EmbedBuilder()
		.setColor(embedColor)
		.setTitle(title)
		.setAuthor({
			name: message.author.username,
			iconURL: message.author.displayAvatarURL(),
		})
		.addFields([
			{ name: "Author", value: `<@${message.author.id}>` },
			{ name: "Channel", value: `<#${message.channel.id}>` },
			...fields,
			...attachments,
		])
		.setDescription(description);

	try {
		const ignored = await checkIfUserIsIgnored({
			id: message.author.id,
			guildId: message.guild.id,
		});

		if (!ignored) {
			await sendMessageToLogChannel({
				event: message,
				serverId: message.guild.id,
				embed,
				category,
			});
		}
	} catch (error) {
		console.error("An error occurred while logging message event:", error);
	}
};
export const logVoiceStateUpdateEvent = async ({
	title,
	description = "",
	fields = [],
	oldState,
	newState,
	color = "Random",
	category,
}: {
	title?: string;
	description?: string;
	fields?: { name: string; value: string }[];
	oldState: VoiceState;
	newState: VoiceState;
	color?: ColorResolvable;
	category?: LogCategory;
}) => {
	const guild = newState.guild || oldState.guild;
	// Early exit if guild is not determined
	if (!guild) {
		return console.error("No guild found. Cannot log voice state update.");
	}

	const user = newState.member?.user || oldState.member?.user;

	// Early exit if user is not determined
	if (!user) {
		return console.error("No user found. Cannot log voice state update.");
	}

	// Skip if the user is a bot
	const { username, avatar, isBot } = getUserProperties({ userObject: user });
	if (isBot) return;

	const channelId = newState.channelId || oldState.channelId; // Fallback to oldState if newState.channelId is null
	if (!channelId) return; // Early exit if channelId is not determined

	// Attempt to fetch server-specific settings
	const server = await getServer({ serverId: guild.id });
	const ignoredUsers = server?.ignoredUsers || [];
	const ignoredChannels = server?.ignoredChannels || [];

	// Skip if user or channel is ignored
	if (ignoredUsers.includes(user.id) || ignoredChannels.includes(channelId)) return;

	// Prepare the embed with provided details
	const embed = new EmbedBuilder()
		.setColor(color as ColorResolvable)
		.setAuthor({ name: username, iconURL: avatar as string })
		.addFields(fields);

	// Optional: Set title and description if provided
	if (title) embed.setTitle(title);
	if (description) embed.setDescription(description);

	// Finally, send the log message
	void sendMessageToLogChannel({
		event: newState,
		serverId: guild.id,
		embed,
		category,
	});
};

export const logUserStatusUpdate = async ({
	title = "Online status",
	description,
	fields = [],
	color = "Blue",
	oldPresence,
	newPresence,
	user,
	category,
}: {
	title?: string | null;
	description?: string;
	oldPresence: Presence;
	newPresence: Presence;
	fields?: { name: string; value: string }[];
	color?: ColorResolvable;
	user: User;
	category?: LogCategory;
}) => {
	const presence = oldPresence?.status ? oldPresence : newPresence;
	const guild = presence.guild;

	const author = getUserProperties({
		userObject: presence.member?.user,
	});

	if (author.isBot) return;

	// Create embed for log message
	const embedColor = color;

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(embedColor as ColorResolvable)
		.setAuthor({ name: `${author.username}`, iconURL: author.avatar })
		.addFields(fields);

	// Set title and description if provided
	if (title) {
		embed.setTitle(title);
	}
	if (description) embed.setDescription(description);

	// Send the embed to the log channel
	if (guild?.id) {
		const server = await getServer({ serverId: guild.id });
		const ignoredUsers = server?.ignoredUsers || [];

		if (!ignoredUsers.includes(user.id)) {
			void sendMessageToLogChannel({
				event: presence,
				serverId: guild.id,
				embed,
				category,
			});
		}
	}
};
