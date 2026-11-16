import { searchWebAcquisition } from "../acquisition";
import { ECONOMY_AVAILABLE_FUNCTIONS, economyFunctions } from "./economy";
import { KNOWLEDGE_AVAILABLE_FUNCTIONS, knowledgeFunctions } from "./knowledge";
import { REACTION_ROLE_AVAILABLE_FUNCTIONS, reactionRoleFunctions } from "./reaction-roles";
import { searchImagesTool, searchNewsTool } from "./search";
import { SERVER_BUILDER_AVAILABLE_FUNCTIONS, serverBuilderFunctions } from "./server-builder";

export enum AgentFunction {
	SEARCH_BRAVE_NEWS = "SEARCH_BRAVE_NEWS",
	SEARCH_WEB = "SEARCH_WEB",
	SEARCH_IMAGES = "SEARCH_IMAGES",
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

export const FUNCTIONS: any[] = [
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

	...reactionRoleFunctions,
	...economyFunctions,
	...serverBuilderFunctions,
	...knowledgeFunctions,
];

// Re-export for convenience
export { ReactionRoleFunction, reactionRoleFunctions } from "./reaction-roles";
export { ServerBuilderFunction, serverBuilderFunctions } from "./server-builder";
export { KnowledgeFunction, knowledgeFunctions } from "./knowledge";

type AvailableFunction = (...args: any[]) => unknown;

export const AVAILABLE_FUNCTIONS: Record<string, AvailableFunction> = {
	[AgentFunction.SEARCH_BRAVE_NEWS]: searchNewsTool,
	[AgentFunction.SEARCH_WEB]: searchWebAcquisition,
	[AgentFunction.SEARCH_IMAGES]: searchImagesTool,

	// Reaction Roles
	...REACTION_ROLE_AVAILABLE_FUNCTIONS,

	// Economy
	...ECONOMY_AVAILABLE_FUNCTIONS,

	// Server Builder
	...SERVER_BUILDER_AVAILABLE_FUNCTIONS,

	// Knowledge
	...KNOWLEDGE_AVAILABLE_FUNCTIONS,
};
