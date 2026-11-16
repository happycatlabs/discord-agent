/**
 * Economy sub-agent - handles economy/leveling info requests.
 */

import { EconomyFunction } from "../../functions/economy";
import { type DelegationParams, type SubAgentResult } from "../types";
import { executeSubAgent } from "./base";

const ECONOMY_AGENT_SYSTEM_PROMPT = `You are an Economy Info Agent for a Discord bot.

**Your Role:**
Provide information about the server's economy and leveling system.

**Available Tools:**
- GET_USER_RANK: Get a user's level, XP, coins, and rank
- GET_LEADERBOARD: Get the top users by level/XP
- GET_BETTING_ODDS: Get current betting odds on users
- GET_BETS_ON_USER: See bets placed on a specific user
- GET_USER_BETS: See bets a user has placed
- GET_BETTING_LINES: Get available betting lines

**Guidelines:**
1. Present information in a casual, readable format
2. Use the serverId from context for all queries
3. When getting user-specific info, use the provided userId

**Context:**
- Server ID: {{serverId}}
- User: {{username}} ({{userId}})

**Your Task:**
{{task}}

Retrieve and present the requested economy information.`;

const ECONOMY_AGENT_TOOLS = [
	EconomyFunction.GET_USER_RANK,
	EconomyFunction.GET_LEADERBOARD,
	EconomyFunction.GET_BETTING_ODDS,
	EconomyFunction.GET_BETS_ON_USER,
	EconomyFunction.GET_USER_BETS,
	EconomyFunction.GET_BETTING_LINES,
];

export const executeEconomyAgent = async (params: DelegationParams): Promise<SubAgentResult> => {
	return executeSubAgent(
		{
			name: "Economy",
			systemPrompt: ECONOMY_AGENT_SYSTEM_PROMPT,
			maxToolCalls: 5,
			tools: ECONOMY_AGENT_TOOLS,
		},
		params,
	);
};
