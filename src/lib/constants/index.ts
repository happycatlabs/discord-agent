import { ACTIVITY_TYPES } from "../enums";

export const IS_DEV = process.env.NODE_ENV === "development";
export const BOT_NAME = process.env.BOT_DISPLAY_NAME || "**Agent** 🕵🏽‍♂️";

/** Comma-separated env list → trimmed, non-empty values. */
export const parseIdList = (value: string | undefined): string[] =>
	(value ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);

/** Discord user IDs allowed to run owner-only commands such as /dc. */
export const ADMIN_USER_IDS = parseIdList(process.env.ADMIN_USER_IDS);

/** Guilds that receive guild-scoped commands from the dev bot (`bun dc-dev`). */
export const DEV_GUILD_IDS = parseIdList(process.env.DEV_GUILD_IDS);

export const activityTypesMap: Record<number, string> = {
	0: ACTIVITY_TYPES.PLAYING,
	1: ACTIVITY_TYPES.STREAMING,
	2: ACTIVITY_TYPES.LISTENING,
	3: ACTIVITY_TYPES.WATCHING,
	4: ACTIVITY_TYPES.CUSTOM,
	5: ACTIVITY_TYPES.COMPETING,
};

export const DEV_CLIENT_ID = process.env.DEV_CLIENT_ID;
export const PROD_CLIENT_ID = process.env.CLIENT_ID;
export const CLIENT_ID = IS_DEV ? DEV_CLIENT_ID : PROD_CLIENT_ID;

// A bot's user ID is its application (client) ID. AGENT_USER_ID overrides it if they ever differ.
export const AGENT_USER_ID = process.env.AGENT_USER_ID || CLIENT_ID || "";
export const AGENT_MENTION_STRING = `<@${AGENT_USER_ID}>`;

export const DEV_TOKEN = process.env.DEV_TOKEN;
export const PROD_TOKEN = process.env.TOKEN;
export const TOKEN = IS_DEV ? DEV_TOKEN : PROD_TOKEN;

export const SERP_API_KEY = process.env.SERP_API_KEY;
