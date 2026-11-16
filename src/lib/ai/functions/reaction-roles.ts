import { type Client, type ColorResolvable, PermissionsBitField } from "discord.js";
import {
	addReactionRoleMapping,
	createReactionRoleMessage,
	deleteReactionRoleMessage,
	getAllMappingsForMessage,
	getReactionRoleMessage,
	getReactionRoleMessagesForServer,
	removeReactionRoleMapping,
} from "../../db/reaction-roles";

// Lazy getter to avoid circular dependency - DISCORD_CLIENT is loaded at runtime
const getDiscordClient = (): Client => {
	// Dynamic import to break the circular dependency
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { DISCORD_CLIENT } = require("../../..");
	return DISCORD_CLIENT;
};

export enum ReactionRoleFunction {
	CREATE_REACTION_ROLE_MESSAGE = "CREATE_REACTION_ROLE_MESSAGE",
	ADD_REACTION_ROLE_MAPPING = "ADD_REACTION_ROLE_MAPPING",
	REMOVE_REACTION_ROLE_MAPPING = "REMOVE_REACTION_ROLE_MAPPING",
	EDIT_REACTION_ROLE_MESSAGE = "EDIT_REACTION_ROLE_MESSAGE",
	LIST_REACTION_ROLE_SETUPS = "LIST_REACTION_ROLE_SETUPS",
	DELETE_REACTION_ROLE_SETUP = "DELETE_REACTION_ROLE_SETUP",
	CREATE_DISCORD_ROLE = "CREATE_DISCORD_ROLE",
	GET_SERVER_ROLES = "GET_SERVER_ROLES",
}

// Function definitions for AI
export const reactionRoleFunctions = [
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.CREATE_REACTION_ROLE_MESSAGE,
			description:
				"Create a new reaction role message in a channel. Users can react to this message to get roles. Use this when the user wants to set up reaction roles.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the message will be created.",
					},
					channelId: {
						type: "string",
						description: "The channel ID where the message will be posted.",
					},
					name: {
						type: "string",
						description:
							"A short name to identify this setup (e.g., 'Color Roles', 'Location Roles').",
					},
					messageContent: {
						type: "string",
						description: "The message content to display. Can include instructions for users.",
					},
					mode: {
						type: "string",
						enum: ["normal", "unique"],
						description:
							"'normal' = users can have multiple roles (toggle on/off), 'unique' = users can only have one role from this group (mutually exclusive).",
					},
					createdBy: {
						type: "string",
						description: "The user ID of who is creating this setup.",
					},
				},
				required: ["serverId", "channelId", "name", "messageContent", "mode", "createdBy"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.ADD_REACTION_ROLE_MAPPING,
			description:
				"Add an emoji-to-role mapping to an existing reaction role message. When users click this emoji, they get this role.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					messageId: {
						type: "string",
						description: "The reaction role message ID to add the mapping to.",
					},
					emoji: {
						type: "string",
						description:
							"The emoji to use. Can be a unicode emoji (e.g., '🇺🇸') or a custom emoji string.",
					},
					roleId: {
						type: "string",
						description: "The role ID to assign when users react.",
					},
				},
				required: ["serverId", "messageId", "emoji", "roleId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.REMOVE_REACTION_ROLE_MAPPING,
			description: "Remove an emoji-to-role mapping from a reaction role message.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					messageId: {
						type: "string",
						description: "The reaction role message ID.",
					},
					emoji: {
						type: "string",
						description: "The emoji to remove.",
					},
				},
				required: ["serverId", "messageId", "emoji"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.EDIT_REACTION_ROLE_MESSAGE,
			description: "Edit the text content of an existing reaction role message.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					messageId: {
						type: "string",
						description: "The reaction role message ID to edit.",
					},
					newContent: {
						type: "string",
						description: "The new message content.",
					},
				},
				required: ["serverId", "messageId", "newContent"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.LIST_REACTION_ROLE_SETUPS,
			description:
				"List all reaction role setups in a server, including their names, channels, modes, and emoji-role mappings.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID to list setups for.",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.DELETE_REACTION_ROLE_SETUP,
			description: "Delete a reaction role setup entirely, including the Discord message.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID.",
					},
					messageId: {
						type: "string",
						description: "The reaction role message ID to delete.",
					},
				},
				required: ["serverId", "messageId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.CREATE_DISCORD_ROLE,
			description:
				"Create a new Discord role in a server. Use this when the user wants to create roles that don't exist yet.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID where the role will be created.",
					},
					name: {
						type: "string",
						description: "The name of the role to create.",
					},
					color: {
						type: "string",
						description:
							"Optional hex color for the role (e.g., '#FF0000' for red). Defaults to no color.",
					},
				},
				required: ["serverId", "name"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReactionRoleFunction.GET_SERVER_ROLES,
			description:
				"Get a list of all roles in a server. Use this to check what roles exist before creating reaction role mappings.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						type: "string",
						description: "The server ID to get roles for.",
					},
				},
				required: ["serverId"],
			},
		},
	},
];

// Implementation functions
export const createReactionRoleMessageTool = async ({
	serverId,
	channelId,
	name,
	messageContent,
	mode,
	createdBy,
}: {
	serverId: string;
	channelId: string;
	name: string;
	messageContent: string;
	mode: "normal" | "unique";
	createdBy: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const channel = await guild.channels.fetch(channelId);

		if (!channel || !channel.isTextBased()) {
			return {
				success: false,
				error: "Channel not found or is not a text channel.",
			};
		}

		// Send the message
		const sentMessage = await channel.send(messageContent);

		// Store in database
		const success = createReactionRoleMessage({
			messageId: sentMessage.id,
			serverId,
			channelId,
			name,
			mode,
			createdBy,
		});

		if (!success) {
			await sentMessage.delete();
			return { success: false, error: "Failed to save to database." };
		}

		return {
			success: true,
			messageId: sentMessage.id,
			channelId,
			name,
			mode,
			message: `Created reaction role message "${name}" in channel. Message ID: ${sentMessage.id}. Now add emoji-role mappings using ADD_REACTION_ROLE_MAPPING.`,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const addReactionRoleMappingTool = async ({
	serverId,
	messageId,
	emoji,
	roleId,
}: {
	serverId: string;
	messageId: string;
	emoji: string;
	roleId: string;
}) => {
	try {
		const reactionRoleMsg = getReactionRoleMessage({ messageId });
		if (!reactionRoleMsg) {
			return {
				success: false,
				error: "Message is not a reaction role message. Create one first.",
			};
		}

		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);

		// Check if role exists
		const role = await guild.roles.fetch(roleId);
		if (!role) {
			return { success: false, error: `Role with ID ${roleId} not found.` };
		}

		// Check role hierarchy
		const botMember = await guild.members.fetchMe();
		if (role.position >= botMember.roles.highest.position) {
			return {
				success: false,
				error: "Cannot manage this role - it's higher than or equal to my highest role.",
			};
		}

		// Parse emoji for custom emojis
		let emojiToStore = emoji;
		let emojiName: string | undefined;
		const customEmojiMatch = emoji.match(/<a?:(\w+):(\d+)>/);
		if (customEmojiMatch) {
			emojiToStore = customEmojiMatch[2];
			emojiName = customEmojiMatch[1];
		}

		// Add to database
		const success = addReactionRoleMapping({
			messageId,
			emoji: emojiToStore,
			emojiName,
			roleId,
		});

		if (!success) {
			return {
				success: false,
				error: "Failed to add mapping. The emoji or role may already be mapped.",
			};
		}

		// Add reaction to the message
		try {
			const channel = await guild.channels.fetch(reactionRoleMsg.channel_id);
			if (channel?.isTextBased()) {
				const message = await channel.messages.fetch(messageId);
				const emojiToReact = customEmojiMatch
					? `${customEmojiMatch[1]}:${customEmojiMatch[2]}`
					: emoji;
				await message.react(emojiToReact);
			}
		} catch (reactError) {
			// Non-fatal, mapping is saved
			console.log(`Could not add reaction: ${String(reactError)}`);
		}

		return {
			success: true,
			message: `Added mapping: ${emoji} → ${role.name}`,
			emoji,
			roleName: role.name,
			roleId,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const removeReactionRoleMappingTool = async ({
	serverId,
	messageId,
	emoji,
}: {
	serverId: string;
	messageId: string;
	emoji: string;
}) => {
	try {
		const reactionRoleMsg = getReactionRoleMessage({ messageId });
		if (!reactionRoleMsg) {
			return { success: false, error: "Message is not a reaction role message." };
		}

		// Parse emoji
		let emojiToRemove = emoji;
		const customEmojiMatch = emoji.match(/<a?:(\w+):(\d+)>/);
		if (customEmojiMatch) {
			emojiToRemove = customEmojiMatch[2];
		}

		const success = removeReactionRoleMapping({
			messageId,
			emoji: emojiToRemove,
		});
		if (!success) {
			return { success: false, error: "Failed to remove mapping." };
		}

		// Remove reaction from message
		try {
			const client = getDiscordClient();
			const guild = await client.guilds.fetch(serverId);
			const channel = await guild.channels.fetch(reactionRoleMsg.channel_id);
			if (channel?.isTextBased()) {
				const message = await channel.messages.fetch(messageId);
				const reaction = message.reactions.cache.find(
					(r) => (r.emoji.id || r.emoji.name) === emojiToRemove,
				);
				if (reaction) {
					await reaction.users.remove(client.user?.id);
				}
			}
		} catch (reactError) {
			console.log(`Could not remove reaction: ${String(reactError)}`);
		}

		return { success: true, message: `Removed mapping for ${emoji}` };
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const editReactionRoleMessageTool = async ({
	serverId,
	messageId,
	newContent,
}: {
	serverId: string;
	messageId: string;
	newContent: string;
}) => {
	try {
		const reactionRoleMsg = getReactionRoleMessage({ messageId });
		if (!reactionRoleMsg) {
			return { success: false, error: "Message is not a reaction role message." };
		}

		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const channel = await guild.channels.fetch(reactionRoleMsg.channel_id);

		if (!channel?.isTextBased()) {
			return { success: false, error: "Channel not found." };
		}

		const message = await channel.messages.fetch(messageId);
		await message.edit(newContent);

		return { success: true, message: "Message updated successfully." };
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const listReactionRoleSetupsTool = async ({ serverId }: { serverId: string }) => {
	try {
		const messages = getReactionRoleMessagesForServer({ serverId });

		if (messages.length === 0) {
			return {
				success: true,
				setups: [],
				message: "No reaction role setups found in this server.",
			};
		}

		const setups = messages.map((msg) => {
			const mappings = getAllMappingsForMessage({ messageId: msg.id });
			return {
				messageId: msg.id,
				name: msg.name,
				channelId: msg.channel_id,
				mode: msg.mode,
				mappings: mappings.map((m) => ({
					emoji: m.emoji_name ? `<:${m.emoji_name}:${m.emoji}>` : m.emoji,
					roleId: m.role_id,
				})),
			};
		});

		return { success: true, setups };
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const deleteReactionRoleSetupTool = async ({
	serverId,
	messageId,
}: {
	serverId: string;
	messageId: string;
}) => {
	try {
		const reactionRoleMsg = getReactionRoleMessage({ messageId });
		if (!reactionRoleMsg) {
			return { success: false, error: "Message is not a reaction role message." };
		}

		// Delete from database
		const success = deleteReactionRoleMessage({ messageId });
		if (!success) {
			return { success: false, error: "Failed to delete from database." };
		}

		// Delete Discord message
		try {
			const client = getDiscordClient();
			const guild = await client.guilds.fetch(serverId);
			const channel = await guild.channels.fetch(reactionRoleMsg.channel_id);
			if (channel?.isTextBased()) {
				const message = await channel.messages.fetch(messageId);
				await message.delete();
			}
		} catch (deleteError) {
			console.log(`Could not delete Discord message: ${String(deleteError)}`);
		}

		return { success: true, message: "Reaction role setup deleted." };
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const createDiscordRoleTool = async ({
	serverId,
	name,
	color,
}: {
	serverId: string;
	name: string;
	color?: string;
}) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);

		// Check if bot has permission to create roles
		const botMember = await guild.members.fetchMe();
		if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
			return { success: false, error: "I don't have permission to create roles." };
		}

		// Check if role already exists
		const existingRole = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
		if (existingRole) {
			return {
				success: true,
				roleId: existingRole.id,
				roleName: existingRole.name,
				message: `Role "${existingRole.name}" already exists.`,
				alreadyExisted: true,
			};
		}

		// Create the role
		const role = await guild.roles.create({
			name,
			color: color ? ((color.startsWith("#") ? color : `#${color}`) as ColorResolvable) : undefined,
			reason: "Created via reaction roles chat interface",
		});

		return {
			success: true,
			roleId: role.id,
			roleName: role.name,
			message: `Created role "${role.name}" with ID ${role.id}`,
			alreadyExisted: false,
		};
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

export const getServerRolesTool = async ({ serverId }: { serverId: string }) => {
	try {
		const client = getDiscordClient();
		const guild = await client.guilds.fetch(serverId);
		const roles = guild.roles.cache
			.filter((r) => r.name !== "@everyone")
			.sort((a, b) => b.position - a.position)
			.map((r) => ({
				id: r.id,
				name: r.name,
				color: r.hexColor,
				position: r.position,
			}));

		return { success: true, roles };
	} catch (error) {
		return { success: false, error: String(error) };
	}
};

// Export implementation map
export const REACTION_ROLE_AVAILABLE_FUNCTIONS = {
	[ReactionRoleFunction.CREATE_REACTION_ROLE_MESSAGE]: createReactionRoleMessageTool,
	[ReactionRoleFunction.ADD_REACTION_ROLE_MAPPING]: addReactionRoleMappingTool,
	[ReactionRoleFunction.REMOVE_REACTION_ROLE_MAPPING]: removeReactionRoleMappingTool,
	[ReactionRoleFunction.EDIT_REACTION_ROLE_MESSAGE]: editReactionRoleMessageTool,
	[ReactionRoleFunction.LIST_REACTION_ROLE_SETUPS]: listReactionRoleSetupsTool,
	[ReactionRoleFunction.DELETE_REACTION_ROLE_SETUP]: deleteReactionRoleSetupTool,
	[ReactionRoleFunction.CREATE_DISCORD_ROLE]: createDiscordRoleTool,
	[ReactionRoleFunction.GET_SERVER_ROLES]: getServerRolesTool,
};
