import { FEATURE_VECTOR_KB } from "../../constants/flags";
import {
	deleteKnowledgeEntry,
	listKnowledgeEntries,
	searchKnowledge,
	storeKnowledgeEntry,
	type KnowledgeContext,
	type KnowledgeScope,
} from "../../db/knowledge";
import type { DelegationContext } from "../agents/types";

export enum KnowledgeFunction {
	SAVE_KNOWLEDGE = "SAVE_KNOWLEDGE",
	SEARCH_KNOWLEDGE = "SEARCH_KNOWLEDGE",
	LIST_KNOWLEDGE = "LIST_KNOWLEDGE",
	DELETE_KNOWLEDGE = "DELETE_KNOWLEDGE",
}

const toKnowledgeContext = (context?: DelegationContext): KnowledgeContext => ({
	userId: context?.userId || "",
	serverId: context?.serverId || "",
	isAdmin: Boolean(context?.isAdmin),
});

const disabledResult = () => ({
	success: false,
	error: "Vector knowledge base is disabled.",
	message: "knowledge storage is disabled right now.",
});

export const knowledgeFunctions = [
	{
		type: "function",
		function: {
			name: KnowledgeFunction.SAVE_KNOWLEDGE,
			description:
				"Save reusable knowledge for later semantic retrieval. User scope is private to the current user. Server/global scopes require authorization.",
			parameters: {
				type: "object",
				properties: {
					scope: {
						type: "string",
						enum: ["user", "server", "global"],
						description:
							"Where to store this knowledge. Use user for private DM/personal memory, server for shared server knowledge, global only for broadly reusable bot knowledge.",
					},
					title: {
						type: "string",
						description: "Short title for the knowledge entry.",
					},
					text: {
						type: "string",
						description: "The durable content to remember.",
					},
					sourceType: {
						type: "string",
						description: "Where this knowledge came from, such as note, web, response, document.",
					},
					sourceUrl: {
						type: "string",
						description: "Source URL if this came from the web or a document.",
					},
				},
				required: ["scope", "text"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: KnowledgeFunction.SEARCH_KNOWLEDGE,
			description:
				"Search stored knowledge with semantic vector search. Results are automatically restricted to the current user's private knowledge, current server knowledge, and global knowledge.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "Natural language search query.",
					},
					scope: {
						type: "string",
						enum: ["auto", "all", "user", "server", "global"],
						description:
							"Scope to search. Use auto unless the user explicitly asks for private, server, or global knowledge.",
					},
					limit: {
						type: "number",
						description: "Maximum number of chunks to return.",
					},
				},
				required: ["query"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: KnowledgeFunction.LIST_KNOWLEDGE,
			description:
				"List stored knowledge entries visible to the current user. Use this when the user asks what is remembered, wants to browse memories, or needs entry IDs for deletion.",
			parameters: {
				type: "object",
				properties: {
					scope: {
						type: "string",
						enum: ["auto", "all", "user", "server", "global"],
						description:
							"Scope to list. Use user for private memories/preferences, server for current-server knowledge, global only when explicitly requested.",
					},
					limit: {
						type: "number",
						description: "Maximum number of entries to list.",
					},
				},
				required: [],
			},
		},
	},
	{
		type: "function",
		function: {
			name: KnowledgeFunction.DELETE_KNOWLEDGE,
			description:
				"Delete a stored knowledge entry by ID. Users can delete their own private entries. Server/global deletion requires authorization.",
			parameters: {
				type: "object",
				properties: {
					entryId: {
						type: "number",
						description: "Knowledge entry ID to delete.",
					},
				},
				required: ["entryId"],
			},
		},
	},
];

export const KNOWLEDGE_AVAILABLE_FUNCTIONS = {
	[KnowledgeFunction.SAVE_KNOWLEDGE]: async (
		args: {
			scope: KnowledgeScope;
			title?: string;
			text: string;
			sourceType?: string;
			sourceUrl?: string;
		},
		context?: DelegationContext,
	) => {
		if (!FEATURE_VECTOR_KB) return disabledResult();
		const result = await storeKnowledgeEntry({
			scope: args.scope,
			title: args.title,
			text: args.text,
			sourceType: args.sourceType,
			sourceUrl: args.sourceUrl,
			context: toKnowledgeContext(context),
		});
		return {
			success: true,
			message: `Saved ${result.scope} knowledge entry ${result.entryId} (${result.chunks} chunk${result.chunks === 1 ? "" : "s"}).`,
			...result,
		};
	},
	[KnowledgeFunction.SEARCH_KNOWLEDGE]: async (
		args: {
			query: string;
			scope?: KnowledgeScope | "auto" | "all";
			limit?: number;
		},
		context?: DelegationContext,
	) => {
		if (!FEATURE_VECTOR_KB) return disabledResult();
		const results = await searchKnowledge({
			query: args.query,
			scope: args.scope,
			limit: args.limit,
			context: toKnowledgeContext(context),
		});
		return {
			success: true,
			message:
				results.length > 0
					? `Found ${results.length} relevant knowledge chunk${results.length === 1 ? "" : "s"}.`
					: "No stored knowledge matched.",
			results,
		};
	},
	[KnowledgeFunction.LIST_KNOWLEDGE]: (
		args: {
			scope?: KnowledgeScope | "auto" | "all";
			limit?: number;
		},
		context?: DelegationContext,
	) => {
		if (!FEATURE_VECTOR_KB) return disabledResult();
		const results = listKnowledgeEntries({
			scope: args.scope,
			limit: args.limit,
			context: toKnowledgeContext(context),
		});
		return {
			success: true,
			message:
				results.length > 0
					? `Found ${results.length} stored knowledge entr${results.length === 1 ? "y" : "ies"}.`
					: "No stored knowledge entries found.",
			results,
		};
	},
	[KnowledgeFunction.DELETE_KNOWLEDGE]: (
		args: {
			entryId: number;
		},
		context?: DelegationContext,
	) => {
		if (!FEATURE_VECTOR_KB) return disabledResult();
		const result = deleteKnowledgeEntry({
			entryId: args.entryId,
			context: toKnowledgeContext(context),
		});
		return {
			success: true,
			message: `Deleted knowledge entry ${result.entryId}.`,
			...result,
		};
	},
};
