/**
 * Thread Sub-Agent - Handles thread creation in Discord channels.
 *
 * This is a specialized sub-agent that only has access to thread-related tools.
 * It's called by the router when a user wants to create threads.
 *
 * SUB-AGENT PATTERN:
 * 1. Define a focused system prompt with available tools and guidelines
 * 2. List the tools this agent can use (keep it minimal)
 * 3. Export an executor function that calls executeSubAgent()
 *
 * ADDING A NEW SUB-AGENT:
 * 1. Copy this file as a template
 * 2. Update the system prompt for your domain
 * 3. Update the tools array with relevant functions
 * 4. Set appropriate maxToolCalls (5 is good for most, 10 for complex ones)
 * 5. Add the executor to router.ts getSubAgentExecutors()
 * 6. Add a delegation tool in router.ts createDelegationTools()
 *
 * @see AGENTS.md ("AI tool architecture")
 */

import { ServerBuilderFunction } from "../../functions";
import { type DelegationParams, type SubAgentResult } from "../types";
import { executeSubAgent } from "./base";

/**
 * System prompt for the thread agent.
 *
 * Placeholders (replaced by executeSubAgent):
 * - {{serverId}} - The Discord server ID
 * - {{userId}} - The user's Discord ID
 * - {{username}} - The user's display name
 * - {{task}} - The task description from the router
 */
const THREAD_AGENT_SYSTEM_PROMPT = `You are a Thread Management Agent for a Discord bot.

**Your Role:**
Create threads in Discord channels. You handle:
- Creating public threads
- Creating private threads
- Setting auto-archive duration

**Available Tools:**
- GET_SERVER_CHANNELS: Find the channel to create the thread in
- CREATE_THREAD: Create a new thread in a channel

**Thread Types:**
- "public" - Visible to everyone who can see the parent channel
- "private" - Only visible to invited users

**Auto-Archive Options:**
- "1hour" - Archive after 1 hour of inactivity
- "1day" - Archive after 1 day (default)
- "3days" - Archive after 3 days
- "1week" - Archive after 1 week

**Guidelines:**
1. First use GET_SERVER_CHANNELS to find the target channel's ID
2. Create the thread with appropriate settings
3. For discussion threads in read-only channels, use public threads

**Context:**
- Server ID: {{serverId}}
- User: {{username}} ({{userId}})

**Your Task:**
{{task}}

Complete the task and confirm what thread was created.`;

/**
 * Tools available to this sub-agent.
 * Keep this minimal - only tools needed for the specific domain.
 */
const THREAD_AGENT_TOOLS = [
	ServerBuilderFunction.GET_SERVER_CHANNELS, // To find the channel ID
	ServerBuilderFunction.CREATE_THREAD, // To create the thread
];

/**
 * Execute the thread sub-agent.
 *
 * @param params - DelegationParams with task and context
 * @returns SubAgentResult with success/failure and details
 */
export const executeThreadAgent = async (params: DelegationParams): Promise<SubAgentResult> => {
	return executeSubAgent(
		{
			name: "Thread",
			systemPrompt: THREAD_AGENT_SYSTEM_PROMPT,
			maxToolCalls: 5, // GET_SERVER_CHANNELS + CREATE_THREAD + buffer
			tools: THREAD_AGENT_TOOLS,
		},
		params,
	);
};
