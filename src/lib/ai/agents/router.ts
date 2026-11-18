/**
 * Router Agent - The hub in the hub-and-spoke delegation pattern.
 *
 * This module is the entry point for all AI chat interactions. It:
 * 1. Receives user messages from chatFromDiscord()
 * 2. Decides whether to delegate to a sub-agent or respond directly
 * 3. Synthesizes sub-agent results into natural responses
 *
 * The router has NO direct tools for actions - only DELEGATE_TO_* tools.
 * This forces clean separation between intent detection (router) and
 * action execution (sub-agents).
 *
 * @see AGENTS.md ("AI tool architecture")
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { DEBUG } from "../../constants/flags";
import { logAiPayloadStats, summarizeToolOutputForLog, truncateForPrompt } from "../prompt-logging";
import { type DelegationContext, SubAgentError, type SubAgentResult } from "./types";

const MAX_RECENT_MESSAGES_CHARS = 12000;

const reportStatus = async (context: DelegationContext, message: string) => {
	try {
		await context.reportStatus?.(message);
	} catch (error) {
		console.warn("[agent-status] failed to report status", error);
	}
};

const buildDelegatedTask = (task: string, context: DelegationContext) => {
	const originalMessage = context.originalMessage?.trim();
	if (!originalMessage || originalMessage === task) return task;

	return [
		`User request: ${truncateForPrompt(originalMessage, 2000)}`,
		`Delegated task: ${task}`,
		"Preserve any user-requested response shape, brevity, source/citation, formatting, tone, and requested level of detail.",
	].join("\n\n");
};

/**
 * Lazy-load sub-agent executors to avoid circular dependencies.
 *
 * The sub-agents import from base.ts which imports from functions/index.ts.
 * If we import sub-agents at module load time, we can hit circular deps.
 * Using require() inside a function defers the import until first use.
 *
 * To add a new sub-agent:
 * 1. Create the sub-agent file in ./sub-agents/
 * 2. Add the require() and return entry here
 * 3. Add a delegation tool in createDelegationTools()
 */
const getSubAgentExecutors = () => {
	const { executeChannelAgent } = require("./sub-agents/channel");
	const { executeThreadAgent } = require("./sub-agents/thread");
	const { executePermissionAgent } = require("./sub-agents/permission");
	const { executeSectionAgent } = require("./sub-agents/section");
	const { executeReactionRoleAgent } = require("./sub-agents/reaction-role");
	const { executeSearchAgent } = require("./sub-agents/search");
	const { executeEconomyAgent } = require("./sub-agents/economy");
	const { executeKnowledgeAgent } = require("./sub-agents/knowledge");

	return {
		channel: executeChannelAgent,
		thread: executeThreadAgent,
		permission: executePermissionAgent,
		section: executeSectionAgent,
		reactionRole: executeReactionRoleAgent,
		search: executeSearchAgent,
		economy: executeEconomyAgent,
		knowledge: executeKnowledgeAgent,
	};
};

/**
 * Enum of delegation tool names for type safety.
 * Each corresponds to a sub-agent that handles a specific domain.
 */
export enum DelegationFunction {
	DELEGATE_TO_CHANNEL_AGENT = "DELEGATE_TO_CHANNEL_AGENT",
	DELEGATE_TO_THREAD_AGENT = "DELEGATE_TO_THREAD_AGENT",
	DELEGATE_TO_PERMISSION_AGENT = "DELEGATE_TO_PERMISSION_AGENT",
	DELEGATE_TO_SECTION_AGENT = "DELEGATE_TO_SECTION_AGENT",
	DELEGATE_TO_REACTION_ROLE_AGENT = "DELEGATE_TO_REACTION_ROLE_AGENT",
	DELEGATE_TO_SEARCH_AGENT = "DELEGATE_TO_SEARCH_AGENT",
	DELEGATE_TO_ECONOMY_AGENT = "DELEGATE_TO_ECONOMY_AGENT",
	DELEGATE_TO_KNOWLEDGE_AGENT = "DELEGATE_TO_KNOWLEDGE_AGENT",
}

/**
 * Create delegation tools for the router agent.
 *
 * Each delegation tool:
 * - Has a description telling the LLM when to use it
 * - Takes a `task` string describing what to do (natural language)
 * - Executes the appropriate sub-agent with context
 * - Returns SubAgentResult
 *
 * The `task` parameter is crucial - it's the router's way of communicating
 * the user's intent to the sub-agent in a clear, actionable way.
 *
 * @param context - DelegationContext passed to all sub-agents
 * @returns Record of delegation tool name -> AI SDK tool
 *
 * IMPORTANT: Use `inputSchema` NOT `parameters` - AI SDK requirement
 */
const createDelegationTools = (context: DelegationContext) => {
	const executors = getSubAgentExecutors();

	return {
		// ============================================================
		// CHANNEL AGENT - Channel CRUD operations
		// ============================================================
		[DelegationFunction.DELEGATE_TO_CHANNEL_AGENT]: tool({
			description:
				"Delegate channel creation, deletion, or listing tasks. " +
				"Use when user wants to: create text/voice/forum channels, " +
				"create categories, delete channels, or understand channel structure.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of what the user wants. " +
							"Example: 'Create a voice channel called gaming-lounge in the Gaming category'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Channel Agent:"), chalk.cyan(task));
				await reportStatus(context, "working on channels...");
				return executors.channel({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// THREAD AGENT - Thread creation
		// ============================================================
		[DelegationFunction.DELEGATE_TO_THREAD_AGENT]: tool({
			description:
				"Delegate thread creation tasks. " +
				"Use when user wants to: create public or private threads in channels.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of the thread task. " +
							"Example: 'Create a discussion thread in the announcements channel'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Thread Agent:"), chalk.cyan(task));
				await reportStatus(context, "working on a thread...");
				return executors.thread({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// PERMISSION AGENT - Channel permissions & log channel
		// ============================================================
		[DelegationFunction.DELEGATE_TO_PERMISSION_AGENT]: tool({
			description:
				"Delegate permission and configuration tasks. " +
				"Use when user wants to: set channel permissions, make channels read-only, " +
				"set log channels, pin/unpin messages, or configure who can see/send in channels.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of the permission task. " +
							"Example: 'Make the announcements channel read-only for everyone except admins'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Permission Agent:"), chalk.cyan(task));
				await reportStatus(context, "checking permissions...");
				return executors.permission({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// SECTION AGENT - Bulk category + channels creation
		// ============================================================
		[DelegationFunction.DELEGATE_TO_SECTION_AGENT]: tool({
			description:
				"Delegate bulk section creation tasks. " +
				"Use when user wants to: create a category with multiple channels at once, " +
				"set up entire server sections like 'fandoms with anime, books, comics'.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of the section to create. " +
							"Example: 'Create a Fandoms section with anime, books, and comics channels'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Section Agent:"), chalk.cyan(task));
				await reportStatus(context, "setting up the section...");
				return executors.section({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// REACTION ROLE AGENT - Reaction role setup & management
		// ============================================================
		[DelegationFunction.DELEGATE_TO_REACTION_ROLE_AGENT]: tool({
			description:
				"Delegate reaction role setup tasks. " +
				"Use when user wants to: set up reaction roles, create role assignment messages, " +
				"add emoji-role mappings, manage existing reaction role setups, or create new roles.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of the reaction role task. " +
							"Example: 'Set up color roles with red, blue, green options in #roles channel'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Reaction Role Agent:"), chalk.cyan(task));
				await reportStatus(context, "working on reaction roles...");
				return executors.reactionRole({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// SEARCH AGENT - Web/image/news search
		// ============================================================
		[DelegationFunction.DELEGATE_TO_SEARCH_AGENT]: tool({
			description:
				"Delegate web search tasks. " +
				"Use when user wants to: search the web for information, fact-check claims, " +
				"find fandom/canon/lore details, find images, or look up current events or news.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of what to search for. " +
							"Example: 'Search for the latest news about AI developments'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Search Agent:"), chalk.cyan(task));
				await reportStatus(context, "searching sources...");
				return executors.search({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// KNOWLEDGE AGENT - Durable memory and retrieval
		// ============================================================
		[DelegationFunction.DELEGATE_TO_KNOWLEDGE_AGENT]: tool({
			description:
				"Delegate saved knowledge tasks. " +
				"Use when user wants to save/remember/forget information, search what is remembered, " +
				"list memories, or use stored knowledge before answering. Also use when the user shares " +
				"a durable preference or personal fact that should likely be remembered. Handles private user, server, and global scopes.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of the knowledge task. " +
							"Example: 'Remember privately that I prefer concise anime lore answers'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Knowledge Agent:"), chalk.cyan(task));
				return executors.knowledge({ task: buildDelegatedTask(task, context), context });
			},
		}),

		// ============================================================
		// ECONOMY AGENT - Ranks, leaderboards, betting
		// ============================================================
		[DelegationFunction.DELEGATE_TO_ECONOMY_AGENT]: tool({
			description:
				"Delegate economy and leveling info tasks. " +
				"Use when user wants to: check ranks, view leaderboards, " +
				"see betting odds, or get economy-related information.",
			inputSchema: z.object({
				task: z
					.string()
					.describe(
						"Clear description of the economy info task. " +
							"Example: 'Get the top 10 users on the leaderboard'",
					),
			}),
			execute: async ({ task }) => {
				console.log(chalk.blue("🔀 Delegating to Economy Agent:"), chalk.cyan(task));
				await reportStatus(context, "checking server stats...");
				return executors.economy({ task: buildDelegatedTask(task, context), context });
			},
		}),
	};
};

/**
 * Router system prompt - focused on intent detection and delegation.
 *
 * Key aspects:
 * - Casual personality (matches bot's Discord presence)
 * - Clear delegation rules (when to delegate vs respond directly)
 * - Instructions for handling sub-agent results naturally
 *
 * Placeholders replaced at runtime: {{currentTime}}, {{serverId}}, {{username}}, {{userId}}
 */
const ROUTER_SYSTEM_PROMPT = `You are a casual Discord bot helping users with server management and chat.

**Your Personality:**
- Casual, laid-back, use lowercase mostly
- Short responses, no corporate speak
- React naturally, like a friend in the server

**Your Role:**
You're a router that delegates specialized tasks to sub-agents.

**CRITICAL - How to Delegate:**
When delegating tasks, DO NOT generate any text before calling the tool. Just call the tool directly.
- WRONG: "let me create that for you" + tool call
- CORRECT: just call the tool, no text

The sub-agent will handle the task and return a result. If the tool returns without error, the task succeeded.
When delegating, include the user's output preferences in the task: short/concise version, sources/citations, formatting, tone, and any requested level of detail.

**When to Delegate:**
- Channel creation/management → DELEGATE_TO_CHANNEL_AGENT
- Thread creation → DELEGATE_TO_THREAD_AGENT
- Permissions, read-only, log channels, pinning/unpinning messages → DELEGATE_TO_PERMISSION_AGENT
- Bulk section setup (category + multiple channels) → DELEGATE_TO_SECTION_AGENT
- Reaction roles, role messages → DELEGATE_TO_REACTION_ROLE_AGENT
- Web search, looking things up, fact-checking, canon/lore/source questions → DELEGATE_TO_SEARCH_AGENT
- Ranks, leaderboards, betting → DELEGATE_TO_ECONOMY_AGENT
- Remembering/saving/forgetting/listing durable information, searching stored memory/knowledge, or storing a stable user preference/fact → DELEGATE_TO_KNOWLEDGE_AGENT

**Direct Message Constraint:**
If Server ID is empty, the user is DMing you. In DMs, answer normally and use search when useful, but do not delegate guild-only tasks like creating channels, changing permissions, reaction roles, or server economy lookups. Ask the user to run those in the server instead.
In DMs, saved knowledge should be user-scoped/private unless the user explicitly asks for global knowledge and is authorized.

**When NOT to Delegate:**
- Casual chat, jokes, greetings → just respond normally
- Simple questions about the conversation → just answer
- Clarifying questions → ask directly, don't delegate

**Context:**
- Current time: {{currentTime}}
- Server ID: {{serverId}}
- User: {{username}} ({{userId}})
`;

/**
 * Map SubAgentError types to user-friendly responses.
 *
 * When a sub-agent fails, we want to give users helpful feedback
 * in a casual tone that matches the bot's personality.
 */
const getErrorResponse = (result: SubAgentResult): string => {
	switch (result.errorType) {
		case SubAgentError.PERMISSION_DENIED:
			return "i don't have the right permissions to do that. might need to check my role in the server settings";
		case SubAgentError.USER_NOT_AUTHORIZED:
			return result.error || "you don't have permission to have me do that";
		case SubAgentError.SERVER_ONLY:
			return "that only works in a server, try it there";
		case SubAgentError.RESOURCE_NOT_FOUND:
			return "couldn't find what you're referring to. maybe double check the channel/role name?";
		case SubAgentError.RATE_LIMITED:
			return "hitting discord's rate limits rn, try again in a sec";
		case SubAgentError.INVALID_INPUT:
			return "not sure i understood that correctly. can you rephrase?";
		default:
			return result.error || "something went wrong on my end";
	}
};

/**
 * Main router function - the entry point for AI chat.
 *
 * Called by chatFromDiscord() in src/lib/util/openai.ts.
 *
 * Flow:
 * 1. Build system prompt with context
 * 2. Call LLM with delegation tools
 * 3. LLM decides: respond directly OR call delegation tool
 * 4. If delegated, sub-agent executes and returns result
 * 5. Router synthesizes natural response from result
 *
 * @param message - The user's message
 * @param context - DelegationContext with server/user info
 * @param recentMessages - Recent conversation history for context
 * @returns Natural language response string
 *
 * @example
 * const response = await routeMessage({
 *   message: "create a thread called discussion in announcements",
 *   context: { serverId, userId, username, ... },
 *   recentMessages: "...",
 * });
 */
export const routeMessage = async ({
	message,
	context,
	recentMessages,
}: {
	message: string;
	context: DelegationContext;
	recentMessages?: string;
}): Promise<string> => {
	const compactRecentMessages = truncateForPrompt(recentMessages, MAX_RECENT_MESSAGES_CHARS);
	// Fill in context placeholders in system prompt
	const systemPrompt = ROUTER_SYSTEM_PROMPT.replace("{{currentTime}}", new Date().toISOString())
		.replace("{{serverId}}", context.serverId)
		.replace("{{username}}", context.username)
		.replace("{{userId}}", context.userId);

	// Include recent messages for conversation context
	const fullSystemPrompt = `${systemPrompt}

**Recent conversation:**
${compactRecentMessages || "(no recent messages)"}

**User's current message:**
${message}`;

	try {
		logAiPayloadStats("router.generateText", {
			systemPrompt: fullSystemPrompt,
			userMessage: message,
			recentMessages: compactRecentMessages,
		});

		// Call the LLM with delegation tools
		const response = await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			instructions: fullSystemPrompt,
			messages: [{ role: "user", content: message }],
			tools: createDelegationTools(context),
			toolChoice: "auto", // Let model decide: respond directly or delegate
			stopWhen: stepCountIs(5), // Router rarely needs more than 1-2 delegation calls
		});

		// Extract tool results from all steps
		const toolResults = response.steps?.flatMap((s) => s.toolResults) || [];
		if (toolResults.length > 0) {
			console.log(
				"[ai-payload] router.toolResults",
				toolResults.map((result) => ({
					toolName: result.toolName,
					...summarizeToolOutputForLog(result.output),
				})),
			);
		}

		// Debug: Log what we received from tools
		if (toolResults.length > 0 && DEBUG) {
			console.log(
				chalk.magenta("📋 Router received tool results:"),
				JSON.stringify(
					toolResults.map((r) => ({
						toolName: r.toolName,
						output: r.output,
					})),
					null,
					2,
				),
			);
		}

		// If any delegation tool was called, ALWAYS prefer its result over response.text
		// The router LLM might generate "let me do that" before the tool call,
		// but the sub-agent's result is what actually happened
		for (const toolResult of toolResults) {
			const result = toolResult.output as SubAgentResult;

			// Check if this is a SubAgentResult (has success property)
			if (result && typeof result.success === "boolean") {
				if (result.success && result.suggestedResponse) {
					console.log(chalk.green("✅ Using sub-agent response:"), {
						chars: result.suggestedResponse.length,
						estimatedTokens: Math.ceil(result.suggestedResponse.length / 4),
					});
					return result.suggestedResponse;
				}

				if (!result.success) {
					// Handle failure
					if (result.suggestedResponse) {
						return result.suggestedResponse;
					}
					return getErrorResponse(result);
				}
			}
		}

		// Fallback to the router's synthesized response (for casual chat, no delegation)
		return response.text || "done";
	} catch (error) {
		console.error("❌ Router error:", error);
		return "something went wrong, try again in a bit";
	}
};
