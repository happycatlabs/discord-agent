import { all, get, normalizeId, run } from "..";

export const ignoreUser = async ({ id, guildId }: { id: string; guildId: string }) => {
	try {
		run(
			`INSERT INTO ignored_users (server_id, user_id)
			 VALUES (?1, ?2)
			 ON CONFLICT(server_id, user_id) DO NOTHING`,
			[normalizeId(guildId), normalizeId(id)],
		);

		console.log("✅ User ignored");
		return true;
	} catch (error) {
		console.log(`Error ignoring user: ${String(error)}\n${JSON.stringify({ id, guildId })}`);
		return false;
	}
};

export const checkIfUserIsIgnored = async ({ id, guildId }: { id: string; guildId: string }) => {
	const record = get<{ user_id: string }>(
		"SELECT user_id FROM ignored_users WHERE server_id = ?1 AND user_id = ?2",
		[normalizeId(guildId), normalizeId(id)],
	);

	return Boolean(record);
};

export const unignoreUser = async ({ id, guildId }: { id: string; guildId: string }) => {
	try {
		run("DELETE FROM ignored_users WHERE server_id = ?1 AND user_id = ?2", [
			normalizeId(guildId),
			normalizeId(id),
		]);

		return true;
	} catch (error) {
		console.log(`Error unignoring user: ${String(error)}\n${JSON.stringify({ id, guildId })}`);
		return false;
	}
};

export const ignoreChannel = async ({ id, guildId }: { id: string; guildId: string }) => {
	try {
		run(
			`INSERT INTO ignored_channels (server_id, channel_id)
			 VALUES (?1, ?2)
			 ON CONFLICT(server_id, channel_id) DO NOTHING`,
			[normalizeId(guildId), normalizeId(id)],
		);

		return true;
	} catch (error) {
		console.log(`Error ignoring channel: ${String(error)}\n${JSON.stringify({ id, guildId })}`);
		return false;
	}
};

export const getIgnoredUsersForServer = async ({ serverId }: { serverId: string }) => {
	try {
		return all<{ user_id: string }>("SELECT user_id FROM ignored_users WHERE server_id = ?1", [
			normalizeId(serverId),
		]).map((record) => record.user_id);
	} catch (error) {
		console.log(
			`Error getting ignored users for server: ${String(error)}\n${JSON.stringify({ serverId })}`,
		);
		return [];
	}
};
