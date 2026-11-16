/**
 * Hierarchical Agent Delegation System
 *
 * This module provides a hub-and-spoke agent architecture where a router agent
 * handles intent detection and delegates to specialized sub-agents.
 *
 * Architecture:
 * User → Router Agent → Sub-Agent (tools) → Router → User Response
 *
 * Entry point: routeMessage() - called by chatFromDiscord() in src/lib/util/openai.ts
 *
 * Key files:
 * - router.ts: Router agent with DELEGATE_TO_* tools
 * - types.ts: DelegationContext, SubAgentResult, etc.
 * - sub-agents/base.ts: createToolsFromFunctions(), executeSubAgent()
 * - sub-agents/*.ts: Specialized sub-agents (channel, thread, permission, etc.)
 *
 * @see AGENTS.md ("AI tool architecture")
 */

export { routeMessage, DelegationFunction } from "./router";
export {
	type DelegationContext,
	type DelegationParams,
	type SubAgentResult,
	type SubAgentConfig,
	type SubAgentExecutor,
	SubAgentError,
} from "./types";

// Sub-agents are imported lazily by the router to avoid circular dependencies
