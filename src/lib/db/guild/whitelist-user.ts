import { all, get, normalizeId, run } from "..";

export const whitelistUser = async ({ userId, serverId }: { userId: string; serverId: string }) => {
	try {
		run(
			`INSERT INTO whitelisted_users (server_id, user_id)
			 VALUES (?1, ?2)
			 ON CONFLICT(server_id, user_id) DO NOTHING`,
			[normalizeId(serverId), normalizeId(userId)],
		);

		console.log("✅ User whitelisted");
		return true;
	} catch (error) {
		console.log(
			`Error whitelisting user: ${String(error)}\n${JSON.stringify({ userId, serverId })}`,
		);
		return false;
	}
};

export const checkIfUserIsWhitelisted = async ({
	id,
	guildId,
}: {
	id: string;
	guildId: string;
}) => {
	const record = get<{ user_id: string }>(
		"SELECT user_id FROM whitelisted_users WHERE server_id = ?1 AND user_id = ?2",
		[normalizeId(guildId), normalizeId(id)],
	);

	return Boolean(record);
};

export const removeUserFromWhitelist = async ({
	userId,
	serverId,
}: {
	userId: string;
	serverId: string;
}) => {
	try {
		run("DELETE FROM whitelisted_users WHERE server_id = ?1 AND user_id = ?2", [
			normalizeId(serverId),
			normalizeId(userId),
		]);

		return true;
	} catch (error) {
		console.log(
			`Error unwhitelisting user: ${String(error)}\n${JSON.stringify({
				id: userId,
				guildId: serverId,
			})}`,
		);
		return false;
	}
};

export const getWhitelistedUsersForServer = async ({ serverId }: { serverId: string }) => {
	try {
		return all<{ user_id: string }>("SELECT user_id FROM whitelisted_users WHERE server_id = ?1", [
			normalizeId(serverId),
		]).map((record) => record.user_id);
	} catch (error) {
		console.log(
			`Error getting whitelisted users for server: ${String(error)}\n${JSON.stringify({ serverId })}`,
		);
		return [];
	}
};
