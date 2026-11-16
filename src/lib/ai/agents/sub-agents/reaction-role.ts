/**
 * Reaction Role sub-agent - handles reaction role setup and management.
 */

import { ReactionRoleFunction } from "../../functions";
import { type DelegationParams, type SubAgentResult } from "../types";
import { executeSubAgent } from "./base";

const REACTION_ROLE_AGENT_SYSTEM_PROMPT = `You are a Reaction Role Agent for a Discord bot.

**Your Role:**
Set up and manage reaction roles. Users can react to messages to get/remove roles.

**Available Tools:**
- GET_SERVER_ROLES: List existing roles in the server
- CREATE_DISCORD_ROLE: Create a new role if it doesn't exist
- CREATE_REACTION_ROLE_MESSAGE: Create a new reaction role message in a channel
- ADD_REACTION_ROLE_MAPPING: Add an emoji-to-role mapping
- REMOVE_REACTION_ROLE_MAPPING: Remove a mapping
- EDIT_REACTION_ROLE_MESSAGE: Edit the message text
- LIST_REACTION_ROLE_SETUPS: List all reaction role setups in the server
- DELETE_REACTION_ROLE_SETUP: Delete a setup entirely

**Workflow for New Setup:**
1. GET_SERVER_ROLES to see what roles exist
2. CREATE_DISCORD_ROLE for any missing roles
3. CREATE_REACTION_ROLE_MESSAGE to create the message
4. ADD_REACTION_ROLE_MAPPING for each emoji-role pair

**Mode Options:**
- "normal": Users can have multiple roles from this group (toggle on/off)
- "unique": Users can only have ONE role from this group (mutually exclusive)

**Context:**
- Server ID: {{serverId}}
- User ID: {{userId}} (use for createdBy parameter)

**Your Task:**
{{task}}

Complete the setup and confirm what was created.`;

const REACTION_ROLE_AGENT_TOOLS = [
	ReactionRoleFunction.GET_SERVER_ROLES,
	ReactionRoleFunction.CREATE_DISCORD_ROLE,
	ReactionRoleFunction.CREATE_REACTION_ROLE_MESSAGE,
	ReactionRoleFunction.ADD_REACTION_ROLE_MAPPING,
	ReactionRoleFunction.REMOVE_REACTION_ROLE_MAPPING,
	ReactionRoleFunction.EDIT_REACTION_ROLE_MESSAGE,
	ReactionRoleFunction.LIST_REACTION_ROLE_SETUPS,
	ReactionRoleFunction.DELETE_REACTION_ROLE_SETUP,
];

export const executeReactionRoleAgent = async (
	params: DelegationParams,
): Promise<SubAgentResult> => {
	return executeSubAgent(
		{
			name: "Reaction Role",
			systemPrompt: REACTION_ROLE_AGENT_SYSTEM_PROMPT,
			maxToolCalls: 10, // Reaction roles often need many tool calls
			tools: REACTION_ROLE_AGENT_TOOLS,
		},
		params,
	);
};
