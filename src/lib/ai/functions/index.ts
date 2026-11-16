import { getServer } from "../../db/guild";
import {
	checkIfUserIsWhitelisted,
	getWhitelistedUsersForServer,
	removeUserFromWhitelist,
	whitelistUser,
} from "../../db/guild/whitelist-user";
import { getMessagesFromUser } from "../../db/messages";
import { createReminder } from "../../db/reminders";
import { getUsersInCurrentVoiceChannel, getUsersInVoiceChannels } from "../../util/discord";
import { getUser } from "../../util/discord";
import { getServerMembers } from "../../util/discord";
import { searchWebAcquisition } from "../acquisition";
import { searchBraveNews, searchImages } from "../brave";
import { ECONOMY_AVAILABLE_FUNCTIONS, economyFunctions } from "./economy";
import { KNOWLEDGE_AVAILABLE_FUNCTIONS, knowledgeFunctions } from "./knowledge";
import { REACTION_ROLE_AVAILABLE_FUNCTIONS, reactionRoleFunctions } from "./reaction-roles";
import { reminderFunctions } from "./reminders";
import { SERVER_BUILDER_AVAILABLE_FUNCTIONS, serverBuilderFunctions } from "./server-builder";

export enum AgentFunction {
	WHITELIST_USER = "WHITELIST_USER",
	UNWHITELIST_USER = "UNWHITELIST_USER",
	GET_WHITELISTED_USERS = "GET_WHITELISTED_USERS",
	GET_USER = "GET_USER",
	GET_SERVER = "GET_SERVER",
	GET_SERVER_MEMBERS = "GET_SERVER_MEMBERS",
	CHECK_WHITELISTED = "CHECK_WHITELISTED",
	GET_USERS_IN_CURRENT_VOICE_CHANNEL = "GET_USERS_IN_CURRENT_VOICE_CHANNEL",
	GET_MESSAGES_FROM_USER = "GET_MESSAGES_FROM_USER",
	GET_USERS_IN_VOICE_CHANNELS = "GET_USERS_IN_VOICE_CHANNELS",
	CREATE_REMINDER = "CREATE_REMINDER",
	REMIND_ME = "REMIND_ME",
	REMIND_USER = "REMIND_USER",
	SEARCH_BRAVE_NEWS = "SEARCH_BRAVE_NEWS",
	SEARCH_WEB = "SEARCH_WEB",
	SEARCH_IMAGES = "SEARCH_IMAGES",
	SEARCH_VIDEOS = "SEARCH_VIDEOS",
	SEARCH_KNOWLEDGE = "SEARCH_KNOWLEDGE",
	SAVE_KNOWLEDGE = "SAVE_KNOWLEDGE",
	LIST_KNOWLEDGE = "LIST_KNOWLEDGE",
	DELETE_KNOWLEDGE = "DELETE_KNOWLEDGE",
}

export enum AgentFeature {
	AGENT_CHAT = "agentChat",
}

export interface Feature {
	name: string;
	description: string;
	enabled: PermissionStatus;
}

export enum PermissionStatus {
	WHITELIST = "whitelist",
	DISABLED = "disabled",
	ENABLED = "enabled",
}

export const FEATURES: Record<AgentFeature, Feature> = {
	[AgentFeature.AGENT_CHAT]: {
		name: "Agent Chat",
		description:
			"Chat with the agent to get help with managing and moderating a Discord server, enforcing rules, handling user reports, and providing helpful information to server members.",
		enabled: PermissionStatus.ENABLED,
	},
};

export const WHITELIST_FEATURES = Object.values(FEATURES).reduce(
	(acc, feature) => {
		if (feature.enabled === PermissionStatus.WHITELIST) {
			acc[feature.name] = feature;
		}
		return acc;
	},
	{} as Record<string, Feature>,
);

export const FUNCTIONS: any[] = [
	{
		type: "function",
		function: {
			name: AgentFunction.WHITELIST_USER,
			description:
				"Add a user to the whitelist. Request's can look like: 'whitelist @user' or 'add @user to the whitelist' etc.",
			parameters: {
				type: "object",
				properties: {
					userId: {
						description: "The ID of the user to whitelist.",
						type: "string",
					},
					serverId: {
						description: "The server ID to whitelist the user on.",
						type: "string",
					},
				},
				required: ["userId", "serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.UNWHITELIST_USER,
			description:
				"Remove a user from the whitelist. Requests can look like: 'unwhitelist @user' or 'remove @user from the whitelist' etc.",
			parameters: {
				type: "object",
				properties: {
					userId: {
						description: "The ID of the user to unwhitelist.",
						type: "string",
					},
					serverId: {
						description: "The server ID to unwhitelist the user on.",
						type: "string",
					},
				},
				required: ["userId", "serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_WHITELISTED_USERS,
			description: "Get a list of users who are whitelisted on the server.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID to get the whitelisted users for.",
						type: "string",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_USER,
			description: "Get details of a user.",
			parameters: {
				type: "object",
				properties: {
					id: {
						description: "The ID of the user to get details for.",
						type: "string",
					},
				},
				required: ["id"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_SERVER,
			description: "Get information about a server.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The ID of the server to get details for.",
						type: "string",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_SERVER_MEMBERS,
			description: "Get members of a server.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The ID of the server to get members for.",
						type: "string",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_USERS_IN_CURRENT_VOICE_CHANNEL,
			description: "Get users in the current voice channel.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID to get the users for.",
						type: "string",
					},
					idOfUserInVoiceChannel: {
						description: "The ID of the user in the voice channel.",
						type: "string",
					},
				},
				required: ["serverId", "idOfUserInVoiceChannel"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_MESSAGES_FROM_USER,
			description:
				"Get recent message history from a user. Only Use this if you need context from a user's messages to help them.",
			parameters: {
				type: "object",
				properties: {
					userId: {
						description: "The ID of the user to get messages from.",
						type: "string",
					},
					serverId: {
						description: "The server ID to get the user's messages from.",
						type: "string",
					},
				},
				required: ["userId", "serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.GET_USERS_IN_VOICE_CHANNELS,
			description: "Get users in voice channels of a server.",
			parameters: {
				type: "object",
				properties: {
					serverId: {
						description: "The server ID to get the users for.",
						type: "string",
					},
				},
				required: ["serverId"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.SEARCH_BRAVE_NEWS,
			description: "Search for recent news articles using the Brave Search API.",
			parameters: {
				type: "object",
				properties: {
					q: {
						type: "string",
						description: "The search query for news articles.",
					},
					count: {
						type: "number",
						description: "The number of news articles to return.",
					},
					freshness: {
						type: "string",
						enum: ["day", "week", "month"],
						description: "Filter results by recency.",
					},
				},
				required: ["q"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.SEARCH_WEB,
			description:
				"Search the web with provider redundancy and source extraction. Uses Brave Web for fast discovery, Brave News for recent/current queries, Parallel Search/Extract, and Jina Search/Reader fallbacks. Returns source-grounded context plus provider diagnostics.",
			parameters: {
				type: "object",
				properties: {
					q: {
						type: "string",
						description: "The search query for web results.",
					},
					count: {
						type: "number",
						description: "The number of web results to return.",
					},
					freshness: {
						type: "string",
						enum: ["day", "week", "month"],
						description: "Filter results by recency.",
					},
				},
				required: ["q"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: AgentFunction.SEARCH_IMAGES,
			description: "Search for images using the Brave Search API.",
			parameters: {
				type: "object",
				properties: {
					q: {
						type: "string",
						description: "The search query for image results.",
					},
					count: {
						type: "number",
						description: "The number of image results to return.",
					},
					freshness: {
						type: "string",
						enum: ["day", "week", "month"],
						description: "Filter results by recency.",
					},
				},
				required: ["q"],
			},
		},
	},

	...reminderFunctions,
	...reactionRoleFunctions,
	...economyFunctions,
	...serverBuilderFunctions,
	...knowledgeFunctions,
];

export const availableToolsWithDescriptions = FUNCTIONS.reduce((acc, func) => {
	acc[func.function.name] = func.function.description;
	return acc;
});

// Re-export for convenience
export { ReactionRoleFunction, reactionRoleFunctions } from "./reaction-roles";
export { ServerBuilderFunction, serverBuilderFunctions } from "./server-builder";
export { KnowledgeFunction, knowledgeFunctions } from "./knowledge";

type AvailableFunction = (...args: any[]) => unknown;

export const AVAILABLE_FUNCTIONS: Record<string, AvailableFunction> = {
	// Whitelist
	[AgentFunction.WHITELIST_USER]: whitelistUser,
	[AgentFunction.UNWHITELIST_USER]: removeUserFromWhitelist,
	[AgentFunction.GET_WHITELISTED_USERS]: getWhitelistedUsersForServer,

	// User
	[AgentFunction.GET_USER]: getUser,

	// Server
	[AgentFunction.GET_SERVER]: getServer,
	[AgentFunction.GET_SERVER_MEMBERS]: getServerMembers,
	[AgentFunction.CHECK_WHITELISTED]: checkIfUserIsWhitelisted,
	[AgentFunction.GET_USERS_IN_CURRENT_VOICE_CHANNEL]: getUsersInCurrentVoiceChannel,
	[AgentFunction.GET_MESSAGES_FROM_USER]: getMessagesFromUser,
	[AgentFunction.GET_USERS_IN_VOICE_CHANNELS]: getUsersInVoiceChannels,

	// I'm noticing these are only getting called when the chat history doesn't include the user asking for the same reminder (gpt-3.5-turbo)
	[AgentFunction.CREATE_REMINDER]: createReminder,
	[AgentFunction.REMIND_ME]: createReminder,
	[AgentFunction.REMIND_USER]: createReminder,

	[AgentFunction.SEARCH_BRAVE_NEWS]: searchBraveNews,
	[AgentFunction.SEARCH_WEB]: searchWebAcquisition,
	[AgentFunction.SEARCH_IMAGES]: searchImages,

	// Reaction Roles
	...REACTION_ROLE_AVAILABLE_FUNCTIONS,

	// Economy
	...ECONOMY_AVAILABLE_FUNCTIONS,

	// Server Builder
	...SERVER_BUILDER_AVAILABLE_FUNCTIONS,

	// Knowledge
	...KNOWLEDGE_AVAILABLE_FUNCTIONS,
};
