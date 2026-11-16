/**
 * Who may call which AI tool, and with which server and user.
 *
 * The model never chooses the server or the acting user. Parameters listed in
 * CONTEXT_BOUND_PARAMS are hidden from the model and filled from the trusted
 * Discord context. Any tool that acts on a server needs admin (Administrator
 * or the server whitelist) unless it is listed in MEMBER_SERVER_TOOLS, so a
 * new server tool is admin-only until someone decides otherwise.
 */

type Context = { serverId: string; userId: string; isAdmin?: boolean };

/** Tool parameter name -> the trusted context field that supplies it. */
export const CONTEXT_BOUND_PARAMS = {
	serverId: "serverId",
	createdBy: "userId",
} as const satisfies Record<string, keyof Context>;

/** Server tools any member may use: read-only lookups of public server data. */
export const MEMBER_SERVER_TOOLS = new Set([
	"GET_LEADERBOARD",
	"GET_USER_RANK",
	"GET_USER_BETS",
	"GET_BETS_ON_USER",
	"GET_BETTING_LINES",
]);

export type ToolDenialCode = "server_only" | "admin_only";

export type ToolDenial = {
	success: false;
	code: ToolDenialCode;
	error: string;
};

export const isContextBoundParam = (name: string) => name in CONTEXT_BOUND_PARAMS;

/**
 * Check access and replace context-bound arguments with trusted values.
 * `paramNames` are the tool's declared parameters (before hiding).
 */
export const bindToolCall = (
	toolName: string,
	paramNames: string[],
	args: Record<string, unknown>,
	context: Context | undefined,
): { ok: true; args: Record<string, unknown> } | { ok: false; denial: ToolDenial } => {
	const actsOnServer = paramNames.includes("serverId");

	if (actsOnServer && !context?.serverId) {
		return {
			ok: false,
			denial: {
				success: false,
				code: "server_only",
				error: "That only works inside a server, not in DMs.",
			},
		};
	}

	if (actsOnServer && !MEMBER_SERVER_TOOLS.has(toolName) && !context?.isAdmin) {
		return {
			ok: false,
			denial: {
				success: false,
				code: "admin_only",
				error: "Only server admins or whitelisted users can do that.",
			},
		};
	}

	const bound: Record<string, unknown> = { ...args };
	for (const [param, field] of Object.entries(CONTEXT_BOUND_PARAMS)) {
		if (paramNames.includes(param)) {
			bound[param] = context?.[field] ?? "";
		}
	}
	return { ok: true, args: bound };
};
