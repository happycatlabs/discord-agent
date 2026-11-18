import {
	ChannelType,
	type Client,
	PermissionsBitField,
	ThreadAutoArchiveDuration,
} from "discord.js";
import type { DelegationContext } from "../agents/types";

// Lazy getter to avoid circular dependency - DISCORD_CLIENT is loaded at runtime
const getDiscordClient = (): Client => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { DISCORD_CLIENT } = require("../../..");
	return DISCORD_CLIENT;
};

export enum ServerBuilderFunction {
	GET_SERVER_CHANNELS = "GET_SERVER_CHANNELS",
	CREATE_CATEGORY = "CREATE_CATEGORY",
	CREATE_TEXT_CHANNEL = "CREATE_TEXT_CHANNEL",
	CREATE_VOICE_CHANNEL = "CREATE_VOICE_CHANNEL",
	CREATE_FORUM_CHANNEL = "CREATE_FORUM_CHANNEL",
	CREATE_THREAD = "CREATE_THREAD",
	CREATE_SECTION = "CREATE_SECTION",
	SET_CHANNEL_PERMISSIONS = "SET_CHANNEL_PERMISSIONS",
	PIN_MESSAGE = "PIN_MESSAGE",
	UNPIN_MESSAGE = "UNPIN_MESSAGE",
	DELETE_CHANNEL = "DELETE_CHANNEL",
	SET_LOG_CHANNEL = "SET_LOG_CHANNEL",
}

// Permission mapping from human-readable names to Discord.js flags
const PERMISSION_MAP: Record<string, bigint> = {
	ViewChannel: PermissionsBitField.Flags.ViewChannel,
	SendMessages: PermissionsBitField.Flags.SendMessages,
	ManageMessages: PermissionsBitField.Flags.ManageMessages,
	PinMessages: PermissionsBitField.Flags.PinMessages,
	EmbedLinks: PermissionsBitField.Flags.EmbedLinks,
	AttachFiles: PermissionsBitField.Flags.AttachFiles,
	ReadMessageHistory: PermissionsBitField.Flags.ReadMessageHistory,
	Connect: PermissionsBitField.Flags.Connect,
	Speak: PermissionsBitField.Flags.Speak,
	MuteMembers: PermissionsBitField.Flags.MuteMembers,
	DeafenMembers: PermissionsBitField.Flags.DeafenMembers,
	MoveMembers: PermissionsBitField.Flags.MoveMembers,
	ManageChannels: PermissionsBitField.Flags.ManageChannels,
	CreatePublicThreads: PermissionsBitField.Flags.CreatePublicThreads,
	CreatePrivateThreads: PermissionsBitField.Flags.CreatePrivateThreads,
	SendMessagesInThreads: PermissionsBitField.Flags.SendMessagesInThreads,
};

interface PermissionOverwriteInput {
	roleId: string; // or "@everyone" for guild.id
	allow?: string[];
	deny?: string[];
}

interface ChannelInput {
	name: string;
	type: "text" | "voice" | "forum";
	topic?: string;
	userLimit?: number;
}

// Function definitions for AI
export const serverBuilderFunctions = [
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.GET_SERVER_CHANNELS,
			description:
				"Get a list of all channels and categories in a server. Use this to understand the current server structure before creating new channels.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID to get channels for.",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.CREATE_CATEGORY,
			description:
				"Create a new category (channel group) in a server. Categories organize channels into collapsible sections.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the category will be created.",
					},
					name: {
						type: "string",
						description: "The name of the category to create.",
					},
					permissionOverwrites: {
						type: "string",
						description:
							'Optional JSON array of permission overwrites. Format: [{"roleId": "role-id-or-@everyone", "allow": ["ViewChannel"], "deny": ["SendMessages"]}]',
					},
				},
				required: ["serverId", "name"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.CREATE_TEXT_CHANNEL,
			description: "Create a new text channel in a server, optionally within a category.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the channel will be created.",
					},
					name: {
						type: "string",
						description: "The name of the text channel to create.",
					},
					categoryId: {
						type: "string",
						description:
							"Optional category ID to place the channel under. If not provided, channel will be at the top level.",
					},
					topic: {
						type: "string",
						description: "Optional topic/description for the channel.",
					},
					permissionOverwrites: {
						type: "string",
						description:
							'Optional JSON array of permission overwrites. Format: [{"roleId": "role-id-or-@everyone", "allow": ["ViewChannel"], "deny": ["SendMessages"]}]',
					},
				},
				required: ["serverId", "name"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.CREATE_VOICE_CHANNEL,
			description: "Create a new voice channel in a server, optionally within a category.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the channel will be created.",
					},
					name: {
						type: "string",
						description: "The name of the voice channel to create.",
					},
					categoryId: {
						type: "string",
						description:
							"Optional category ID to place the channel under. If not provided, channel will be at the top level.",
					},
					userLimit: {
						type: "number",
						description:
							"Optional maximum number of users allowed in the voice channel (0 = unlimited).",
					},
					permissionOverwrites: {
						type: "string",
						description:
							'Optional JSON array of permission overwrites. Format: [{"roleId": "role-id-or-@everyone", "allow": ["Connect"], "deny": ["Speak"]}]',
					},
				},
				required: ["serverId", "name"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.CREATE_FORUM_CHANNEL,
			description:
				"Create a new forum channel in a server, optionally within a category. Forum channels allow users to create posts/threads.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the channel will be created.",
					},
					name: {
						type: "string",
						description: "The name of the forum channel to create.",
					},
					categoryId: {
						type: "string",
						description:
							"Optional category ID to place the channel under. If not provided, channel will be at the top level.",
					},
					topic: {
						type: "string",
						description: "Optional topic/description for the forum (shown as guidelines).",
					},
					permissionOverwrites: {
						type: "string",
						description:
							'Optional JSON array of permission overwrites. Format: [{"roleId": "role-id-or-@everyone", "allow": ["ViewChannel"], "deny": ["SendMessages"]}]',
					},
				},
				required: ["serverId", "name"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.CREATE_THREAD,
			description:
				"Create a new thread in an existing text channel. Useful for creating discussion threads in read-only channels where users can still chat in the thread.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the thread will be created.",
					},
					channelId: {
						type: "string",
						description: "The text channel ID where the thread will be created.",
					},
					name: {
						type: "string",
						description: "The name of the thread to create.",
					},
					type: {
						type: "string",
						enum: ["public", "private"],
						description:
							"Thread type: 'public' (visible to all who can see the channel) or 'private' (invite only). Defaults to public.",
					},
					autoArchiveDuration: {
						type: "string",
						enum: ["1hour", "1day", "3days", "1week"],
						description:
							"How long until the thread auto-archives after inactivity. Defaults to 1day.",
					},
				},
				required: ["serverId", "channelId", "name"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.CREATE_SECTION,
			description:
				"Create a category with multiple channels in one operation. Use this for bulk setup like 'create a fandoms section with anime, books, and comics channels'.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the section will be created.",
					},
					categoryName: {
						type: "string",
						description: "The name of the category to create.",
					},
					channels: {
						type: "string",
						description:
							'JSON array of channels to create. Format: [{"name": "anime", "type": "text", "topic": "Anime discussion"}, {"name": "voice-chat", "type": "voice", "userLimit": 10}]',
					},
					permissionOverwrites: {
						type: "string",
						description:
							'Optional JSON array of permission overwrites for the category (inherited by channels). Format: [{"roleId": "@everyone", "deny": ["ViewChannel"]}]',
					},
				},
				required: ["serverId", "categoryName", "channels"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.SET_CHANNEL_PERMISSIONS,
			description:
				"Modify permissions on an existing channel for a specific role. Use this to make channels read-only, private, etc.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					channelId: {
						type: "string",
						description: "The channel ID to modify permissions on.",
					},
					roleId: {
						type: "string",
						description: 'The role ID to set permissions for, or "@everyone" for the default role.',
					},
					allow: {
						type: "string",
						description:
							"Comma-separated list of permissions to allow. Options: ViewChannel, SendMessages, ManageMessages, EmbedLinks, AttachFiles, ReadMessageHistory, Connect, Speak, CreatePublicThreads, CreatePrivateThreads, SendMessagesInThreads",
					},
					deny: {
						type: "string",
						description: "Comma-separated list of permissions to deny.",
					},
				},
				required: ["serverId", "channelId", "roleId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.PIN_MESSAGE,
			description:
				"Pin a message in a Discord channel. If messageId is omitted, pins the message that the user's request replied to.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID. Defaults to the current server from context when omitted.",
					},
					channelId: {
						type: "string",
						description:
							"The channel ID containing the message. Defaults to the current channel from context.",
					},
					messageId: {
						type: "string",
						description:
							"The message ID to pin. If omitted, the referenced/replied-to message is used.",
					},
				},
				required: [],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.UNPIN_MESSAGE,
			description:
				"Unpin a message in a Discord channel. If messageId is omitted, unpins the message that the user's request replied to.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID. Defaults to the current server from context when omitted.",
					},
					channelId: {
						type: "string",
						description:
							"The channel ID containing the message. Defaults to the current channel from context.",
					},
					messageId: {
						type: "string",
						description:
							"The message ID to unpin. If omitted, the referenced/replied-to message is used.",
					},
				},
				required: [],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.DELETE_CHANNEL,
			description:
				"Delete a channel or category from a server. Use with caution - this is irreversible.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					channelId: {
						type: "string",
						description: "The channel or category ID to delete.",
					},
				},
				required: ["serverId", "channelId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ServerBuilderFunction.SET_LOG_CHANNEL,
			description:
				"Set the log channel for the server where bot events and actions are logged. Can be a text channel or a thread.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					channelId: {
						type: "string",
						description:
							"The channel or thread ID to use for logging. Must be a text-based channel.",
					},
				},
				required: ["serverId", "channelId"],
			},
		},
	},
];

// Helper to build permission overwrites from input
function buildPermissionOverwrites(guildId: string, overwrites?: PermissionOverwriteInput[]) {
	if (!overwrites || overwrites.length === 0) return [];

	return overwrites.map((ow) => ({
		id: ow.roleId === "@everyone" ? guildId : ow.roleId,
		allow: ow.allow?.map((p) => PERMISSION_MAP[p]).filter(Boolean) || [],
		deny: ow.deny?.map((p) => PERMISSION_MAP[p]).filter(Boolean) || [],
	}));
}

// Parse JSON string safely
function parseJsonParam<T>(param: string | undefined): T | undefined {
	if (!param) return undefined;
	try {
		return JSON.parse(param) as T;
	} catch {
		return undefined;
	}
}

// Implementation functions

export const getServerChannelsTool = async ({ serverId }: { serverId: string }) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);

		const channels = guild.channels.cache
			.sort(
				(a, b) =>
					("rawPosition" in a ? a.rawPosition : 0) - ("rawPosition" in b ? b.rawPosition : 0),
			)
			.map((c) => ({
				id: c.id,
				name: c.name,
				type:
					c.type === ChannelType.GuildCategory
						? "category"
						: c.type === ChannelType.GuildText
							? "text"
							: c.type === ChannelType.GuildVoice
								? "voice"
								: c.type === ChannelType.GuildForum
									? "forum"
									: c.type === ChannelType.GuildAnnouncement
										? "announcement"
										: "other",
				parentId: "parentId" in c ? c.parentId : null,
				position: "rawPosition" in c ? c.rawPosition : 0,
			}));

		// Group by category for easier reading
		const categories = channels.filter((c) => c.type === "category");
		const topLevel = channels.filter((c) => c.type !== "category" && !c.parentId);
		const byCategory = categories.map((cat) => ({
			...cat,
			children: channels.filter((c) => c.parentId === cat.id),
		}));

		return {
			success: true,
			topLevelChannels: topLevel,
			categories: byCategory,
			totalChannels: channels.length,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createCategoryTool = async ({
	serverId,
	name,
	permissionOverwrites,
}: {
	serverId: string;
	name: string;
	permissionOverwrites?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const botMember = await guild.members.fetchMe();

		// Check permission
		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error:
					"I don't have permission to manage channels. I need the 'Manage Channels' permission.",
			};
		}

		// Check if category already exists
		const existingCategory = guild.channels.cache.find(
			(c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase(),
		);
		if (existingCategory) {
			return {
				success: true,
				categoryId: existingCategory.id,
				categoryName: existingCategory.name,
				message: `Category "${existingCategory.name}" already exists.`,
				alreadyExisted: true,
			};
		}

		const overwrites = parseJsonParam<PermissionOverwriteInput[]>(permissionOverwrites);

		const category = await guild.channels.create({
			name,
			type: ChannelType.GuildCategory,
			permissionOverwrites: buildPermissionOverwrites(guild.id, overwrites),
			reason: "Created via AI chat interface",
		});

		return {
			success: true,
			categoryId: category.id,
			categoryName: category.name,
			message: `Created category "${category.name}"`,
			alreadyExisted: false,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createTextChannelTool = async ({
	serverId,
	name,
	categoryId,
	topic,
	permissionOverwrites,
}: {
	serverId: string;
	name: string;
	categoryId?: string;
	topic?: string;
	permissionOverwrites?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const botMember = await guild.members.fetchMe();

		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error: "I don't have permission to manage channels.",
			};
		}

		// Check if channel already exists in same location
		const existingChannel = guild.channels.cache.find(
			(c) =>
				c.type === ChannelType.GuildText &&
				c.name.toLowerCase() === name.toLowerCase().replace(/\s+/g, "-") &&
				(categoryId ? c.parentId === categoryId : !c.parentId),
		);
		if (existingChannel) {
			return {
				success: true,
				channelId: existingChannel.id,
				channelName: existingChannel.name,
				message: `Text channel "#${existingChannel.name}" already exists.`,
				alreadyExisted: true,
			};
		}

		const overwrites = parseJsonParam<PermissionOverwriteInput[]>(permissionOverwrites);

		const channel = await guild.channels.create({
			name,
			type: ChannelType.GuildText,
			parent: categoryId,
			topic,
			permissionOverwrites: buildPermissionOverwrites(guild.id, overwrites),
			reason: "Created via AI chat interface",
		});

		return {
			success: true,
			channelId: channel.id,
			channelName: channel.name,
			message: `Created text channel "#${channel.name}"${categoryId ? " in category" : ""}`,
			alreadyExisted: false,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createVoiceChannelTool = async ({
	serverId,
	name,
	categoryId,
	userLimit,
	permissionOverwrites,
}: {
	serverId: string;
	name: string;
	categoryId?: string;
	userLimit?: number;
	permissionOverwrites?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const botMember = await guild.members.fetchMe();

		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error: "I don't have permission to manage channels.",
			};
		}

		const existingChannel = guild.channels.cache.find(
			(c) =>
				c.type === ChannelType.GuildVoice &&
				c.name.toLowerCase() === name.toLowerCase() &&
				(categoryId ? c.parentId === categoryId : !c.parentId),
		);
		if (existingChannel) {
			return {
				success: true,
				channelId: existingChannel.id,
				channelName: existingChannel.name,
				message: `Voice channel "${existingChannel.name}" already exists.`,
				alreadyExisted: true,
			};
		}

		const overwrites = parseJsonParam<PermissionOverwriteInput[]>(permissionOverwrites);

		const channel = await guild.channels.create({
			name,
			type: ChannelType.GuildVoice,
			parent: categoryId,
			userLimit: userLimit ?? 0,
			permissionOverwrites: buildPermissionOverwrites(guild.id, overwrites),
			reason: "Created via AI chat interface",
		});

		return {
			success: true,
			channelId: channel.id,
			channelName: channel.name,
			message: `Created voice channel "${channel.name}"${categoryId ? " in category" : ""}`,
			alreadyExisted: false,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createForumChannelTool = async ({
	serverId,
	name,
	categoryId,
	topic,
	permissionOverwrites,
}: {
	serverId: string;
	name: string;
	categoryId?: string;
	topic?: string;
	permissionOverwrites?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const botMember = await guild.members.fetchMe();

		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error: "I don't have permission to manage channels.",
			};
		}

		const existingChannel = guild.channels.cache.find(
			(c) =>
				c.type === ChannelType.GuildForum &&
				c.name.toLowerCase() === name.toLowerCase().replace(/\s+/g, "-") &&
				(categoryId ? c.parentId === categoryId : !c.parentId),
		);
		if (existingChannel) {
			return {
				success: true,
				channelId: existingChannel.id,
				channelName: existingChannel.name,
				message: `Forum channel "${existingChannel.name}" already exists.`,
				alreadyExisted: true,
			};
		}

		const overwrites = parseJsonParam<PermissionOverwriteInput[]>(permissionOverwrites);

		const channel = await guild.channels.create({
			name,
			type: ChannelType.GuildForum,
			parent: categoryId,
			topic,
			permissionOverwrites: buildPermissionOverwrites(guild.id, overwrites),
			reason: "Created via AI chat interface",
		});

		return {
			success: true,
			channelId: channel.id,
			channelName: channel.name,
			message: `Created forum channel "${channel.name}"${categoryId ? " in category" : ""}`,
			alreadyExisted: false,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createThreadTool = async ({
	serverId,
	channelId,
	name,
	type = "public",
	autoArchiveDuration = "1day",
}: {
	serverId: string;
	channelId: string;
	name: string;
	type?: "public" | "private";
	autoArchiveDuration?: "1hour" | "1day" | "3days" | "1week";
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const channel = await guild.channels.fetch(channelId);

		if (
			!channel ||
			!channel.isTextBased() ||
			channel.isThread() ||
			!("threads" in channel) ||
			(channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
		) {
			return {
				success: false,
				error: "Channel not found or is not a text channel.",
			};
		}

		// Map duration string to Discord enum
		const durationMap: Record<string, ThreadAutoArchiveDuration> = {
			"1hour": ThreadAutoArchiveDuration.OneHour,
			"1day": ThreadAutoArchiveDuration.OneDay,
			"3days": ThreadAutoArchiveDuration.ThreeDays,
			"1week": ThreadAutoArchiveDuration.OneWeek,
		};

		const threadType = type === "private" ? ChannelType.PrivateThread : ChannelType.PublicThread;

		// Check if thread with same name exists
		const existingThread = channel.threads.cache.find(
			(t) => t.name.toLowerCase() === name.toLowerCase(),
		);
		if (existingThread) {
			return {
				success: true,
				threadId: existingThread.id,
				threadName: existingThread.name,
				message: `Thread "${existingThread.name}" already exists in this channel.`,
				alreadyExisted: true,
			};
		}

		const thread = await channel.threads.create({
			name,
			type: threadType,
			autoArchiveDuration: durationMap[autoArchiveDuration],
			reason: "Created via AI chat interface",
		} as any);

		return {
			success: true,
			threadId: thread.id,
			threadName: thread.name,
			message: `Created ${type} thread "${thread.name}" in #${channel.name}`,
			alreadyExisted: false,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createSectionTool = async ({
	serverId,
	categoryName,
	channels,
	permissionOverwrites,
}: {
	serverId: string;
	categoryName: string;
	channels: string;
	permissionOverwrites?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const botMember = await guild.members.fetchMe();

		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error: "I don't have permission to manage channels.",
			};
		}

		const channelDefs = parseJsonParam<ChannelInput[]>(channels);
		if (!channelDefs || channelDefs.length === 0) {
			return {
				success: false,
				error:
					'Invalid channels parameter. Expected JSON array like: [{"name": "general", "type": "text"}]',
			};
		}

		const overwrites = parseJsonParam<PermissionOverwriteInput[]>(permissionOverwrites);

		// Create category first
		let category = guild.channels.cache.find(
			(c) =>
				c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase(),
		);

		let categoryCreated = false;
		if (!category) {
			category = await guild.channels.create({
				name: categoryName,
				type: ChannelType.GuildCategory,
				permissionOverwrites: buildPermissionOverwrites(guild.id, overwrites),
				reason: "Created via AI chat interface (bulk section)",
			});
			categoryCreated = true;
		}

		// Create channels
		const createdChannels: Array<{
			id: string;
			name: string;
			type: string;
		}> = [];

		for (const channelDef of channelDefs) {
			const channelType =
				channelDef.type === "voice"
					? ChannelType.GuildVoice
					: channelDef.type === "forum"
						? ChannelType.GuildForum
						: ChannelType.GuildText;

			// Check if exists
			const existing = guild.channels.cache.find(
				(c) =>
					c.type === channelType &&
					c.name.toLowerCase() === channelDef.name.toLowerCase().replace(/\s+/g, "-") &&
					c.parentId === category.id,
			);

			if (existing) {
				createdChannels.push({
					id: existing.id,
					name: existing.name,
					type: channelDef.type,
				});
				continue;
			}

			const newChannel = await guild.channels.create({
				name: channelDef.name,
				type: channelType,
				parent: category.id,
				topic: channelDef.topic,
				userLimit: channelDef.userLimit,
				reason: "Created via AI chat interface (bulk section)",
			});

			createdChannels.push({
				id: newChannel.id,
				name: newChannel.name,
				type: channelDef.type,
			});
		}

		return {
			success: true,
			category: {
				id: category.id,
				name: category.name,
				created: categoryCreated,
			},
			channels: createdChannels,
			message: `${categoryCreated ? "Created" : "Used existing"} category "${category.name}" with ${createdChannels.length} channels`,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const setChannelPermissionsTool = async ({
	serverId,
	channelId,
	roleId,
	allow,
	deny,
}: {
	serverId: string;
	channelId: string;
	roleId: string;
	allow?: string;
	deny?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const channel = await guild.channels.fetch(channelId);
		const botMember = await guild.members.fetchMe();

		if (!channel) {
			return { success: false, error: "Channel not found." };
		}

		if (!("permissionOverwrites" in channel)) {
			return {
				success: false,
				error: "Permissions can only be modified on guild channels.",
			};
		}

		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error: "I don't have permission to manage channels.",
			};
		}

		const targetRoleId = roleId === "@everyone" ? guild.id : roleId;

		// Build permission overwrite object
		const permissionUpdate: Record<string, boolean> = {};

		if (allow) {
			const allowPerms = allow.split(",").map((p) => p.trim());
			for (const perm of allowPerms) {
				if (PERMISSION_MAP[perm]) {
					permissionUpdate[perm] = true;
				}
			}
		}

		if (deny) {
			const denyPerms = deny.split(",").map((p) => p.trim());
			for (const perm of denyPerms) {
				if (PERMISSION_MAP[perm]) {
					permissionUpdate[perm] = false;
				}
			}
		}

		await channel.permissionOverwrites.edit(targetRoleId, permissionUpdate, {
			reason: "Modified via AI chat interface",
		});

		return {
			success: true,
			message: `Updated permissions on #${channel.name} for ${roleId === "@everyone" ? "@everyone" : `role ${roleId}`}`,
			allowed: allow?.split(",").map((p) => p.trim()) || [],
			denied: deny?.split(",").map((p) => p.trim()) || [],
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

type MessagePinArgs = {
	serverId?: string;
	channelId?: string;
	messageId?: string;
};

async function resolveMessagePinTarget(
	{ serverId, channelId, messageId }: MessagePinArgs,
	context?: DelegationContext,
) {
	// Who may pin is checked in tool-access.ts (PinMessages, admin or whitelist).
	const resolvedServerId = serverId || context?.serverId;
	const resolvedChannelId = channelId || context?.channelId;
	const resolvedMessageId = messageId || context?.referencedMessageId;

	if (!resolvedServerId) {
		return { ok: false as const, error: "Pinning messages only works in a server." };
	}
	if (context?.serverId && resolvedServerId !== context.serverId) {
		return { ok: false as const, error: "I can only pin messages in the current server." };
	}
	if (!resolvedChannelId) {
		return { ok: false as const, error: "I need a channel to pin a message." };
	}
	if (!resolvedMessageId) {
		return {
			ok: false as const,
			error: "Reply to the message you want pinned, then ask me to pin it.",
		};
	}

	const client = getDiscordClient();
	const guild = await client.guilds.fetch(resolvedServerId);
	const channel = await guild.channels.fetch(resolvedChannelId);
	const botMember = await guild.members.fetchMe();

	if (!channel || !channel.isTextBased() || !("messages" in channel)) {
		return { ok: false as const, error: "I can only pin messages in text-based channels." };
	}

	const permissions = "permissionsFor" in channel ? channel.permissionsFor(botMember) : null;
	if (
		!permissions?.has(PermissionsBitField.Flags.PinMessages) ||
		!permissions.has(PermissionsBitField.Flags.ReadMessageHistory)
	) {
		return {
			ok: false as const,
			error: "I need Pin Messages and Read Message History permissions in that channel.",
		};
	}

	const message = await channel.messages.fetch(resolvedMessageId);
	return { ok: true as const, channel, message };
}

export const pinMessageTool = async (args: MessagePinArgs, context?: DelegationContext) => {
	try {
		const target = await resolveMessagePinTarget(args, context);
		if (!target.ok) return { success: false, error: target.error };

		if (target.message.pinned) {
			return {
				success: true,
				message: `Message is already pinned in #${target.channel.name}.`,
				alreadyPinned: true,
				messageId: target.message.id,
				channelId: target.channel.id,
			};
		}

		await target.message.pin(`Pinned via AI chat by ${context?.username ?? "user"}`);

		return {
			success: true,
			message: `Pinned message in #${target.channel.name}.`,
			messageId: target.message.id,
			channelId: target.channel.id,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const unpinMessageTool = async (args: MessagePinArgs, context?: DelegationContext) => {
	try {
		const target = await resolveMessagePinTarget(args, context);
		if (!target.ok) return { success: false, error: target.error };

		if (!target.message.pinned) {
			return {
				success: true,
				message: `Message is not pinned in #${target.channel.name}.`,
				alreadyUnpinned: true,
				messageId: target.message.id,
				channelId: target.channel.id,
			};
		}

		await target.message.unpin(`Unpinned via AI chat by ${context?.username ?? "user"}`);

		return {
			success: true,
			message: `Unpinned message in #${target.channel.name}.`,
			messageId: target.message.id,
			channelId: target.channel.id,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const deleteChannelTool = async ({
	serverId,
	channelId,
}: {
	serverId: string;
	channelId: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const channel = await guild.channels.fetch(channelId);
		const botMember = await guild.members.fetchMe();

		if (!channel) {
			return { success: false, error: "Channel not found." };
		}

		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return {
				success: false,
				error: "I don't have permission to manage channels.",
			};
		}

		const channelName = channel.name;
		const channelType = channel.type === ChannelType.GuildCategory ? "category" : "channel";

		await channel.delete("Deleted via AI chat interface");

		return {
			success: true,
			message: `Deleted ${channelType} "${channelName}"`,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const setLogChannelTool = async ({
	serverId,
	channelId,
}: {
	serverId: string;
	channelId: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const channel = await guild.channels.fetch(channelId);

		if (!channel) {
			return { success: false, error: "Channel not found." };
		}

		if (!channel.isTextBased()) {
			return {
				success: false,
				error: "Channel must be a text-based channel (text channel or thread).",
			};
		}

		// Import setChannel dynamically to avoid circular dependency
		const { setChannel } = require("../../db/guild");
		await setChannel({
			channel: { id: channel.id, name: channel.name },
			server: { id: serverId, name: guild.name },
		});

		const channelType = channel.isThread() ? "thread" : "channel";

		return {
			success: true,
			channelId: channel.id,
			channelName: channel.name,
			message: `Log channel set to ${channelType} "${channel.name}"`,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

// Export implementation map
export const SERVER_BUILDER_AVAILABLE_FUNCTIONS = {
	[ServerBuilderFunction.GET_SERVER_CHANNELS]: getServerChannelsTool,
	[ServerBuilderFunction.CREATE_CATEGORY]: createCategoryTool,
	[ServerBuilderFunction.CREATE_TEXT_CHANNEL]: createTextChannelTool,
	[ServerBuilderFunction.CREATE_VOICE_CHANNEL]: createVoiceChannelTool,
	[ServerBuilderFunction.CREATE_FORUM_CHANNEL]: createForumChannelTool,
	[ServerBuilderFunction.CREATE_THREAD]: createThreadTool,
	[ServerBuilderFunction.CREATE_SECTION]: createSectionTool,
	[ServerBuilderFunction.SET_CHANNEL_PERMISSIONS]: setChannelPermissionsTool,
	[ServerBuilderFunction.PIN_MESSAGE]: pinMessageTool,
	[ServerBuilderFunction.UNPIN_MESSAGE]: unpinMessageTool,
	[ServerBuilderFunction.DELETE_CHANNEL]: deleteChannelTool,
	[ServerBuilderFunction.SET_LOG_CHANNEL]: setLogChannelTool,
};
