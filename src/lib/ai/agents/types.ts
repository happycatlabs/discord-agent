/**
 * Shared types for the hierarchical agent delegation system.
 */

/**
 * Context passed from router to sub-agents.
 */
export type AgentStatusReporter = (message: string) => void | Promise<void>;

export type CapturedSearchSources = {
	query: string;
	sources: Array<{
		title?: string;
		url: string;
		source?: string;
		sourceKind?: string;
		provider?: string;
		publishDate?: string;
	}>;
	diagnostics?: unknown;
};

export type SearchSourceRecorder = (search: CapturedSearchSources) => void | Promise<void>;

export interface DelegationContext {
	/** The Discord server ID */
	serverId: string;
	/** The user ID who initiated the request */
	userId: string;
	/** The user's mention string (e.g., <@123456>) */
	userMentionString: string;
	/** The user's display name */
	username: string;
	/** Administrator or the server whitelist: full access to server tools */
	isAdmin?: boolean;
	/** The member's server-level Discord permissions; unlocks matching tools (see tool-access.ts) */
	permissions?: bigint;
	/** The original message from the user */
	originalMessage: string;
	/** Recent conversation history for context */
	conversationHistory?: string;
	/** The channel ID where the message was sent */
	channelId?: string;
	/** The Discord message ID that triggered the agent */
	triggerMessageId?: string;
	/** The Discord message ID referenced by the triggering message, if any */
	referencedMessageId?: string;
	/** Optional UI status callback for Discord typing/progress updates */
	reportStatus?: AgentStatusReporter;
	/** Optional callback for persisting search sources after a response is sent */
	recordSearchSources?: SearchSourceRecorder;
}

/**
 * Result returned by sub-agents to the router.
 */
export interface SubAgentResult {
	/** Whether the operation was successful */
	success: boolean;
	/** Human-readable summary of what happened */
	summary: string;
	/** Structured data for router to reference */
	details?: unknown;
	/** Error message if success=false */
	error?: string;
	/** Error type for categorized handling */
	errorType?: SubAgentError;
	/** Optional: sub-agent's suggested user-facing message */
	suggestedResponse?: string;
	/** Can router retry with different approach? */
	retryable?: boolean;
}

/**
 * Categorized error types for better error handling.
 */
export enum SubAgentError {
	/** The bot lacks a Discord permission. */
	PERMISSION_DENIED = "PERMISSION_DENIED",
	/** The requesting user lacks the Discord permission, admin or whitelist the tool needs. */
	USER_NOT_AUTHORIZED = "USER_NOT_AUTHORIZED",
	/** A server-only tool was requested from a DM. */
	SERVER_ONLY = "SERVER_ONLY",
	RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
	RATE_LIMITED = "RATE_LIMITED",
	INVALID_INPUT = "INVALID_INPUT",
	TOOL_EXECUTION_FAILED = "TOOL_EXECUTION_FAILED",
	TIMEOUT = "TIMEOUT",
	UNKNOWN = "UNKNOWN",
}

/**
 * Parameters passed to delegation tools.
 */
export interface DelegationParams {
	/** Natural language description of what to do */
	task: string;
	/** Context from the router */
	context: DelegationContext;
	/** Optional extracted parameters for hints */
	specificParams?: Record<string, string>;
}

/**
 * Sub-agent executor function type.
 */
export type SubAgentExecutor = (params: DelegationParams) => Promise<SubAgentResult>;

/**
 * Configuration for a sub-agent.
 */
export interface SubAgentConfig {
	/** The sub-agent's name for logging */
	name: string;
	/** System prompt for the sub-agent */
	systemPrompt: string;
	/** Tool call limit for this sub-agent */
	maxToolCalls: number;
	/** The tools available to this sub-agent (function names) */
	tools: string[];
}
