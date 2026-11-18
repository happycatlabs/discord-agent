/**
 * Who may call which AI tool, and with which server and user.
 *
 * The model never chooses the server or the acting user. Parameters listed in
 * CONTEXT_BOUND_PARAMS are hidden from the model and filled from the trusted
 * Discord context.
 *
 * A tool that acts on a server needs one of:
 * - admin: Discord Administrator or the server whitelist (full access), or
 * - the Discord permissions listed for it in TOOL_PERMISSIONS, or
 * - nothing, if it is listed in MEMBER_SERVER_TOOLS.
 * A server tool missing from both lists is admin-only until someone decides otherwise.
 */
import { PermissionFlagsBits } from "discord.js";

type Context = {
	serverId: string;
	userId: string;
	/** Administrator or the server whitelist. */
	isAdmin?: boolean;
	/** The member's server-level Discord permissions. */
	permissions?: bigint;
};

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

const P = PermissionFlagsBits;

/** Server tools a member may use when they hold every listed Discord permission. */
export const TOOL_PERMISSIONS: Record<string, bigint[]> = {
	GET_SERVER_CHANNELS: [P.ManageChannels],
	CREATE_CATEGORY: [P.ManageChannels],
	CREATE_SECTION: [P.ManageChannels],
	CREATE_TEXT_CHANNEL: [P.ManageChannels],
	CREATE_VOICE_CHANNEL: [P.ManageChannels],
	CREATE_FORUM_CHANNEL: [P.ManageChannels],
	DELETE_CHANNEL: [P.ManageChannels],
	SET_CHANNEL_PERMISSIONS: [P.ManageChannels, P.ManageRoles],
	CREATE_THREAD: [P.CreatePublicThreads],
	PIN_MESSAGE: [P.PinMessages],
	UNPIN_MESSAGE: [P.PinMessages],
	SET_LOG_CHANNEL: [P.ManageGuild],
	GET_SERVER_ROLES: [P.ManageRoles],
	CREATE_DISCORD_ROLE: [P.ManageRoles],
	LIST_REACTION_ROLE_SETUPS: [P.ManageRoles],
	CREATE_REACTION_ROLE_MESSAGE: [P.ManageRoles],
	ADD_REACTION_ROLE_MAPPING: [P.ManageRoles],
	REMOVE_REACTION_ROLE_MAPPING: [P.ManageRoles],
	EDIT_REACTION_ROLE_MESSAGE: [P.ManageRoles],
	DELETE_REACTION_ROLE_SETUP: [P.ManageRoles],
};

const CHANNEL_CREATE_TOOLS = new Set([
	"CREATE_CATEGORY",
	"CREATE_SECTION",
	"CREATE_TEXT_CHANNEL",
	"CREATE_VOICE_CHANNEL",
	"CREATE_FORUM_CHANNEL",
]);

const hasValue = (value: unknown) => {
	if (typeof value === "string") return value.trim() !== "" && value.trim() !== "[]";
	if (Array.isArray(value)) return value.length > 0;
	return value !== undefined && value !== null;
};

/** The permissions this specific call needs: the tool's own, plus any its arguments add. */
export const requiredPermissions = (toolName: string, args: Record<string, unknown>) => {
	// Discord treats public and private thread creation as separate permissions.
	if (toolName === "CREATE_THREAD" && args.type === "private") return [P.CreatePrivateThreads];
	const base = TOOL_PERMISSIONS[toolName];
	if (!base) return undefined;
	const extra: bigint[] = [];
	// Overwrites at creation time are the same power as SET_CHANNEL_PERMISSIONS.
	if (CHANNEL_CREATE_TOOLS.has(toolName) && hasValue(args.permissionOverwrites)) {
		extra.push(P.ManageRoles);
	}
	return [...base, ...extra.filter((flag) => !base.includes(flag))];
};

const hasAll = (permissions: bigint | undefined, required: bigint[]) =>
	permissions !== undefined && required.every((flag) => (permissions & flag) === flag);

/** Administrator or the server whitelist: no per-tool checks apply. */
export const hasFullServerAccess = (context: Context | undefined) =>
	Boolean(context?.isAdmin) || hasAll(context?.permissions, [P.Administrator]);

/** Whether this context may run a server tool with these arguments. */
export const canUseServerTool = (
	toolName: string,
	args: Record<string, unknown>,
	context: Context | undefined,
) => {
	if (MEMBER_SERVER_TOOLS.has(toolName) || hasFullServerAccess(context)) return true;
	const required = requiredPermissions(toolName, args);
	return required !== undefined && hasAll(context?.permissions, required);
};

export type ToolDenialCode = "server_only" | "not_permitted";

export type ToolDenial = {
	success: false;
	code: ToolDenialCode;
	error: string;
};

/** Names as Discord's UI shows them, e.g. ManageGuild -> "Manage Server". */
const permissionName = (flag: bigint) => {
	if (flag === P.ManageGuild) return "Manage Server";
	const name = Object.entries(PermissionFlagsBits).find(([, value]) => value === flag)?.[0] ?? "";
	return name.replace(/([a-z])([A-Z])/g, "$1 $2");
};

const missingPermissionMessage = (toolName: string, args: Record<string, unknown>) => {
	const required = requiredPermissions(toolName, args);
	if (!required) return "Only server admins or whitelisted users can do that.";
	const names = required.map(permissionName).join(" and ");
	const noun = required.length > 1 ? "permissions" : "permission";
	return `You need the ${names} ${noun} to do that (or be a server admin or whitelisted).`;
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

	if (actsOnServer && !canUseServerTool(toolName, args, context)) {
		return {
			ok: false,
			denial: {
				success: false,
				code: "not_permitted",
				error: missingPermissionMessage(toolName, args),
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
