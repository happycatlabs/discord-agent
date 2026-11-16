import { all, get, normalizeId, run } from "..";
import { getServer } from "../guild";

export enum LogCategory {
	MESSAGES = "messages",
	MEMBERS = "members",
	MODERATION = "moderation",
	VOICE = "voice",
	INVITES = "invites",
	ROLES = "roles",
}

export interface LogDestination {
	server_id: string;
	category: LogCategory;
	channel_id: string;
	created_at: string;
}

/**
 * Get the log channel for a specific category.
 * Falls back to the default log_channel if no category-specific destination is set.
 */
export const getLogDestination = async ({
	serverId,
	category,
}: {
	serverId: string;
	category: LogCategory;
}): Promise<string | null> => {
	// First check for category-specific destination
	const destination = get<{ channel_id: string }>(
		"SELECT channel_id FROM log_destinations WHERE server_id = ?1 AND category = ?2",
		[normalizeId(serverId), category],
	);

	if (destination) {
		return destination.channel_id;
	}

	// Fall back to default log channel
	const server = await getServer({ serverId });
	return server?.logChannel ?? null;
};

/**
 * Get all log destinations for a server (category-specific only, not the default).
 */
export const getAllLogDestinations = ({
	serverId,
}: {
	serverId: string;
}): Map<LogCategory, string> => {
	const destinations = all<{ category: string; channel_id: string }>(
		"SELECT category, channel_id FROM log_destinations WHERE server_id = ?1",
		[normalizeId(serverId)],
	);

	const map = new Map<LogCategory, string>();
	for (const dest of destinations) {
		map.set(dest.category as LogCategory, dest.channel_id);
	}
	return map;
};

/**
 * Set a log destination for a specific category.
 */
export const setLogDestination = ({
	serverId,
	category,
	channelId,
}: {
	serverId: string;
	category: LogCategory;
	channelId: string;
}): void => {
	run(
		`INSERT INTO log_destinations (server_id, category, channel_id)
		 VALUES (?1, ?2, ?3)
		 ON CONFLICT(server_id, category) DO UPDATE SET channel_id = ?3`,
		[normalizeId(serverId), category, normalizeId(channelId)],
	);
};

/**
 * Clear a log destination for a specific category (reverts to default).
 */
export const clearLogDestination = ({
	serverId,
	category,
}: {
	serverId: string;
	category: LogCategory;
}): void => {
	run("DELETE FROM log_destinations WHERE server_id = ?1 AND category = ?2", [
		normalizeId(serverId),
		category,
	]);
};

/**
 * Get a summary of all log destinations for display.
 * Returns the default channel and any category overrides.
 */
export const getLogDestinationSummary = async ({
	serverId,
}: {
	serverId: string;
}): Promise<{
	defaultChannel: string | null;
	overrides: Map<LogCategory, string>;
}> => {
	const server = await getServer({ serverId });
	const overrides = getAllLogDestinations({ serverId });

	return {
		defaultChannel: server?.logChannel ?? null,
		overrides,
	};
};
