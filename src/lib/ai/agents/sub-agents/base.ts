/**
 * Base utilities for sub-agents in the hierarchical delegation system.
 *
 * This module provides shared functionality for all sub-agents:
 * - Converting OpenAI-style function definitions to AI SDK tools
 * - Executing sub-agents with proper tool calling
 * - Error categorization for user-friendly responses
 *
 * @see AGENTS.md ("AI tool architecture")
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, tool, type Tool } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { AVAILABLE_FUNCTIONS, FUNCTIONS } from "../../functions";
import { logAiPayloadStats, summarizeToolOutputForLog } from "../../prompt-logging";
import { createLogger } from "../../../util/logger";
import { bindToolCall, isContextBoundParam, type ToolDenialCode } from "../../tool-access";
import {
	type DelegationParams,
	type SubAgentConfig,
	SubAgentError,
	type SubAgentResult,
} from "../types";

type SubAgentTool = Tool<Record<string, unknown>, any>;
type ToolOutput = {
	success?: boolean;
	error?: string;
	code?: ToolDenialCode;
	message?: string;
	results?: Array<{
		title?: string;
		url?: string;
		description?: string;
		excerpts?: string[];
		source?: string;
		sourceKind?: string;
		provider?: string;
		publishDate?: string;
	}>;
	diagnostics?: unknown;
};

const logger = createLogger("ai.subagent");
const HIDDEN_STATUS_TOOLS = new Set([
	"SEARCH_KNOWLEDGE",
	"SAVE_KNOWLEDGE",
	"LIST_KNOWLEDGE",
	"DELETE_KNOWLEDGE",
]);

const hostFromUrl = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
};

const getToolStatusMessage = (functionName: string) => {
	if (HIDDEN_STATUS_TOOLS.has(functionName)) return null;

	switch (functionName) {
		case "SEARCH_WEB":
			return "reading web sources...";
		case "SEARCH_BRAVE_NEWS":
			return "checking recent news...";
		case "SEARCH_IMAGES":
			return "looking for images...";
		case "CREATE_THREAD":
			return "creating thread...";
		case "PIN_MESSAGE":
			return "pinning message...";
		case "UNPIN_MESSAGE":
			return "unpinning message...";
		case "CREATE_CHANNEL":
		case "CREATE_CATEGORY":
			return "creating channel...";
		case "GET_SERVER_CHANNELS":
			return "checking channels...";
		default:
			return "using a tool...";
	}
};

const isToolOutput = (output: unknown): output is ToolOutput =>
	typeof output === "object" && output !== null;

const hasExplicitSuccessFlag = (output: unknown): output is ToolOutput & { success: boolean } =>
	isToolOutput(output) && typeof output.success === "boolean";

/**
 * Convert OpenAI-style function definitions to AI SDK tools.
 *
 * Our function definitions in src/lib/ai/functions/ use OpenAI's format:
 * ```
 * { function: { name, description, parameters: { type, properties, required } } }
 * ```
 *
 * The AI SDK requires Zod schemas with `inputSchema` (NOT `parameters`).
 * This function bridges the gap by dynamically building Zod schemas.
 *
 * @param functionNames - Array of function names to convert (must exist in FUNCTIONS)
 * @returns Record of tool name -> AI SDK tool
 *
 * @example
 * const tools = createToolsFromFunctions([
 *   ServerBuilderFunction.GET_SERVER_CHANNELS,
 *   ServerBuilderFunction.CREATE_THREAD,
 * ]);
 *
 * IMPORTANT: The AI SDK tool() helper requires `inputSchema`, not `parameters`.
 * Using `parameters` will cause: "input_schema.type: Field required" errors.
 */
export const createToolsFromFunctions = (
	functionNames: string[],
	context?: DelegationParams["context"],
) => {
	const tools: Record<string, SubAgentTool> = {};

	for (const funcName of functionNames) {
		// Find the function definition from our centralized FUNCTIONS array
		const funcDef = FUNCTIONS.find((f) => f.function.name === funcName);
		if (!funcDef) {
			console.warn(`Function ${funcName} not found in FUNCTIONS`);
			continue;
		}

		// Build Zod schema from OpenAI-style parameters
		// This converts { type: "string", description: "..." } to z.string().describe("...")
		const paramNames = Object.keys(funcDef.function.parameters.properties);
		// Server and acting-user params come from trusted context, so the model never sees them.
		const schemaEntries = Object.entries(funcDef.function.parameters.properties)
			.filter(([key]) => !isContextBoundParam(key))
			.map(([key, prop]: [string, any]) => {
				let zodSchema: z.ZodType;

				// Handle different parameter types
				if (prop.enum && prop.type === "string") {
					// Enum strings become z.enum()
					zodSchema = z.enum(prop.enum as [string, ...string[]]);
				} else if (prop.type === "string") {
					zodSchema = z.string();
				} else if (prop.type === "number") {
					zodSchema = z.number();
				} else {
					// Default to string for unknown types
					zodSchema = z.string();
				}

				// Add description for LLM context
				if (prop.description) {
					zodSchema = zodSchema.describe(prop.description);
				}

				// Mark optional fields
				const requiredFields = funcDef.function.parameters.required || [];
				if (!requiredFields.includes(key)) {
					zodSchema = zodSchema.optional();
				}

				return [key, zodSchema];
			});

		const parametersSchema = z.object(Object.fromEntries(schemaEntries));

		// Create the AI SDK tool
		// CRITICAL: Use `inputSchema` NOT `parameters` - this is an AI SDK requirement
		tools[funcName] = tool({
			description: funcDef.function.description,
			inputSchema: parametersSchema, // NOT `parameters` - causes Anthropic API errors
			execute: async (args: Record<string, unknown>) => {
				// Log tool calls for debugging
				console.log(
					chalk.yellow("🛠️  Sub-agent tool:"),
					chalk.cyan(`${funcName}(${JSON.stringify(args)})`),
				);
				try {
					const statusMessage = getToolStatusMessage(funcName);
					if (statusMessage) {
						await context?.reportStatus?.(statusMessage);
					}
				} catch (error) {
					logger.warn("failed to report tool status", {
						tool: funcName,
						error: String(error),
					});
				}

				const access = bindToolCall(funcName, paramNames, args, context);
				if (!access.ok) {
					logger.warn("tool call denied", { tool: funcName, code: access.denial.code });
					return access.denial;
				}

				try {
					// Look up and execute the actual function
					const functionToCall = AVAILABLE_FUNCTIONS[funcName as keyof typeof AVAILABLE_FUNCTIONS];
					if (!functionToCall) {
						throw new Error(`Function ${funcName} not found`);
					}
					const result = await functionToCall(access.args as never, context);
					if (
						funcName === "SEARCH_WEB" &&
						hasExplicitSuccessFlag(result) &&
						result.success &&
						Array.isArray(result.results)
					) {
						await context?.recordSearchSources?.({
							query: typeof args.q === "string" ? args.q : "",
							sources: result.results
								.filter((source) => typeof source.url === "string")
								.map((source) => ({
									title: source.title,
									url: source.url as string,
									description: source.description,
									excerpts: source.excerpts,
									source: source.source,
									sourceKind: source.sourceKind,
									provider: source.provider,
									publishDate: source.publishDate,
								})),
							diagnostics: result.diagnostics,
						});
					}
					if (
						(funcName === "SEARCH_BRAVE_NEWS" || funcName === "SEARCH_IMAGES") &&
						Array.isArray(result)
					) {
						await context?.recordSearchSources?.({
							query: typeof args.q === "string" ? args.q : "",
							sources: result
								.filter((source) => typeof source.url === "string")
								.map((source) => ({
									title: typeof source.title === "string" ? source.title : undefined,
									url: source.url as string,
									description:
										typeof source.description === "string" ? source.description : undefined,
									source: hostFromUrl(source.url as string),
									sourceKind: funcName === "SEARCH_BRAVE_NEWS" ? "news" : "unknown",
									provider: funcName === "SEARCH_BRAVE_NEWS" ? "brave_news" : "brave_images",
									publishDate:
										typeof source.age === "string"
											? source.age
											: typeof source.published_time === "string"
												? source.published_time
												: undefined,
								})),
						});
					}
					return result;
				} catch (error) {
					console.error(`❌ Tool execution failed: ${funcName}`, error);
					// Return error in structured format for result processing
					return {
						success: false,
						error: String(error),
					};
				}
			},
		});
	}

	return tools;
};

/**
 * Execute a sub-agent with the given configuration.
 *
 * This is the core function that runs any sub-agent. It:
 * 1. Builds the system prompt with context placeholders filled in
 * 2. Creates AI SDK tools from function names
 * 3. Calls the LLM with multi-step tool calling enabled
 * 4. Processes results into a SubAgentResult
 *
 * @param config - Sub-agent configuration (name, prompt, tools, limits)
 * @param params - Delegation parameters (task, context)
 * @returns SubAgentResult with success/failure and details
 *
 * @example
 * return executeSubAgent({
 *   name: "Thread",
 *   systemPrompt: THREAD_AGENT_SYSTEM_PROMPT,
 *   maxToolCalls: 5,
 *   tools: [ServerBuilderFunction.GET_SERVER_CHANNELS, ServerBuilderFunction.CREATE_THREAD],
 * }, params);
 *
 * IMPORTANT: Uses `stopWhen: stepCountIs(N)` to enable multi-step tool calling.
 * Without this, the model stops after the first tool call returns.
 */
export const executeSubAgent = async (
	config: SubAgentConfig,
	params: DelegationParams,
): Promise<SubAgentResult> => {
	const { task, context } = params;

	// Replace placeholders in system prompt with actual context
	// Sub-agent prompts use {{serverId}}, {{userId}}, {{username}}, {{task}}
	const systemPrompt = config.systemPrompt
		.replace(/\{\{serverId\}\}/g, context.serverId)
		.replace(/\{\{userId\}\}/g, context.userId)
		.replace(/\{\{username\}\}/g, context.username)
		.replace(/\{\{task\}\}/g, task);

	try {
		const tools = createToolsFromFunctions(config.tools, context);
		logAiPayloadStats(`subagent.${config.name}.generateText`, {
			systemPrompt,
			task,
		});

		// Call the LLM with tool calling enabled
		// CRITICAL: Use `stopWhen: stepCountIs(N)` for multi-step tool calling
		// Without this, the model stops after ONE tool call and won't continue
		// to call additional tools needed to complete the task
		const response = await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: task },
			],
			tools,
			toolChoice: "auto", // Let model decide when to use tools
			stopWhen: stepCountIs(config.maxToolCalls), // Enable multi-step, limit iterations
		});

		// Extract and categorize tool results from all steps
		// response.steps contains each generation step with its tool calls/results
		const toolResults = response.steps?.flatMap((s) => s.toolResults || []) || [];
		if (toolResults.length > 0) {
			console.log(
				`[ai-payload] subagent.${config.name}.toolResults`,
				toolResults.map((result) => ({
					toolName: result.toolName,
					...summarizeToolOutputForLog(result.output),
				})),
			);
		}
		const successfulOps = toolResults.filter(
			(r) => hasExplicitSuccessFlag(r.output) && r.output.success,
		);
		const failedOps = toolResults.filter(
			(r) => hasExplicitSuccessFlag(r.output) && !r.output.success,
		);

		// If all operations failed, return error result
		if (failedOps.length > 0 && successfulOps.length === 0) {
			const firstError = failedOps[0].output;
			const denied = failedOps.find((op) => op.output.code)?.output.code;
			return {
				success: false,
				summary: `Failed to complete ${config.name} operation`,
				error: firstError.error || "Unknown error",
				errorType:
					denied === "admin_only"
						? SubAgentError.USER_NOT_AUTHORIZED
						: denied === "server_only"
							? SubAgentError.SERVER_ONLY
							: categorizeError(firstError.error),
				retryable: !denied,
			};
		}

		// Build response from actual tool messages (preferred) or LLM text
		// Tools return { success: true, message: "Created thread 'X' in #channel" }
		const toolMessages = successfulOps
			.map((r) => r.output.message)
			.filter((message): message is string => Boolean(message));

		const responseText = response.text?.trim();
		const shouldPreferSynthesis = config.name === "Search" && responseText;

		// Prefer synthesized text for Search so raw source/acquisition context is not sent to users.
		const suggestedResponse = shouldPreferSynthesis
			? responseText
			: toolMessages.length > 0
				? toolMessages.join(". ")
				: responseText || `done, completed ${successfulOps.length} ${config.name} operation(s)`;

		return {
			success: true,
			summary: suggestedResponse,
			details:
				config.name === "Search"
					? {
							operations: successfulOps.map((result) => ({
								toolName: result.toolName,
								...summarizeToolOutputForLog(result.output),
							})),
							toolCallCount: toolResults.length,
						}
					: {
							operations: successfulOps.map((r) => r.output),
							toolCallCount: toolResults.length,
						},
			suggestedResponse,
		};
	} catch (error) {
		console.error(`❌ ${config.name} agent error:`, error);
		return {
			success: false,
			summary: `${config.name} agent encountered an error`,
			error: String(error),
			errorType: SubAgentError.UNKNOWN,
			retryable: false,
		};
	}
};

/**
 * Categorize an error message into a SubAgentError type.
 *
 * This enables the router to provide user-friendly error messages
 * based on the type of failure (permissions, not found, rate limits, etc.)
 *
 * @param error - Error message string to categorize
 * @returns SubAgentError enum value
 */
const categorizeError = (error?: string): SubAgentError => {
	if (!error) return SubAgentError.UNKNOWN;

	const lowerError = error.toLowerCase();

	if (
		lowerError.includes("permission") ||
		lowerError.includes("not allowed") ||
		lowerError.includes("forbidden")
	) {
		return SubAgentError.PERMISSION_DENIED;
	}

	if (
		lowerError.includes("not found") ||
		lowerError.includes("does not exist") ||
		lowerError.includes("unknown")
	) {
		return SubAgentError.RESOURCE_NOT_FOUND;
	}

	if (lowerError.includes("rate limit") || lowerError.includes("too many requests")) {
		return SubAgentError.RATE_LIMITED;
	}

	if (
		lowerError.includes("invalid") ||
		lowerError.includes("malformed") ||
		lowerError.includes("expected")
	) {
		return SubAgentError.INVALID_INPUT;
	}

	return SubAgentError.TOOL_EXECUTION_FAILED;
};
