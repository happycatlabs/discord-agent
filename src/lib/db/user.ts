import { all, get, normalizeId, run, transaction, withPrefix } from ".";

import type { Server } from "../types/server";
import type { User } from "../types/user";

type UserRow = {
	id: string;
	tag: string | null;
	username: string | null;
	display_name: string | null;
	global_name: string | null;
	discriminator: string | null;
	avatar: string | null;
	is_bot: number;
	created_at: string | null;
	updated_at: string | null;
};

const mapRowToUser = (row: UserRow): User => ({
	id: row.id,
	databaseID: withPrefix(row.id, "user"),
	tag: row.tag ?? `${row.username ?? ""}#${row.discriminator ?? ""}`,
	username: row.username ?? "",
	displayName: row.display_name ?? row.username ?? "",
	globalName: row.global_name ?? row.username ?? "",
	discriminator: row.discriminator ?? "",
	avatar: row.avatar ?? "",
	isBot: Boolean(row.is_bot),
	createdAt: row.created_at ?? new Date().toISOString(),
	servers: [],
});

const upsertMembership = ({ serverId, userId }: { serverId: string; userId: string }) => {
	run(
		`INSERT INTO server_memberships (server_id, user_id, joined_at)
		 VALUES (?1, ?2, ?3)
		 ON CONFLICT(server_id, user_id) DO NOTHING`,
		[serverId, userId, new Date().toISOString()],
	);
};

const writeUser = ({ user, isUpdate }: { user: User; isUpdate: boolean }) => {
	const userId = normalizeId(user.id);
	const now = new Date().toISOString();

	run(
		`INSERT INTO users (
			id,
			tag,
			username,
			display_name,
			global_name,
			discriminator,
			avatar,
			is_bot,
			created_at,
			updated_at
		) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
		ON CONFLICT(id) DO UPDATE SET
			tag = excluded.tag,
			username = excluded.username,
			display_name = excluded.display_name,
			global_name = excluded.global_name,
			discriminator = excluded.discriminator,
			avatar = excluded.avatar,
			is_bot = excluded.is_bot,
			updated_at = excluded.updated_at`,
		[
			userId,
			user.tag ?? `${user.username}#${user.discriminator}`,
			user.username,
			user.displayName,
			user.globalName,
			user.discriminator,
			user.avatar,
			user.isBot ? 1 : 0,
			user.createdAt ?? now,
			isUpdate ? now : (user.createdAt ?? now),
		],
	);
};

export const createUser = async ({
	user: { id, databaseID: _userDatabaseID, ...user },
	server,
	update = false,
}: {
	user: User;
	server: Server;
	update?: boolean;
}) => {
	const userId = normalizeId(id);
	const serverId = normalizeId(server.id);

	let created = false;
	let updated = false;

	transaction(() => {
		const existing = get<UserRow>("SELECT * FROM users WHERE id = ?1", [userId]);

		if (!existing) {
			writeUser({ user: { ...user, id } as User, isUpdate: false });
			created = true;
			// log("User stored.", LogType.USER_UPDATE);
		} else if (update) {
			writeUser({ user: { ...user, id } as User, isUpdate: true });
			updated = true;
			// log("User updated.", LogType.USER_UPDATE);
		}

		upsertMembership({ serverId, userId });
	});

	return {
		created,
		updated,
	};
};

export const createUsers = async ({
	users,
	server,
	update = false,
}: {
	users: User[];
	server: Server;
	update?: boolean;
}) => {
	let stored = 0;
	let totalUpdated = 0;

	for (const user of users) {
		const result = await createUser({ user, server, update });
		if (result.created) stored += 1;
		if (result.updated) totalUpdated += 1;
	}

	return { stored, updated: totalUpdated };
};

export const getUserFromDb = async ({ id }: { id: string }): Promise<User> => {
	const userId = normalizeId(id);
	const row = get<UserRow>("SELECT * FROM users WHERE id = ?1", [userId]);

	const baseUser = row
		? mapRowToUser(row)
		: {
				id: userId,
				databaseID: withPrefix(userId, "user"),
				tag: "",
				username: "",
				displayName: "",
				globalName: "",
				discriminator: "",
				avatar: "",
				isBot: false,
				createdAt: new Date().toISOString(),
			};

	const memberships = all<{ server_id: string }>(
		"SELECT server_id FROM server_memberships WHERE user_id = ?1",
		[userId],
	);

	return {
		...baseUser,
		servers: memberships.map((membership) => membership.server_id),
	};
};

export const getServerUsers = async ({ serverId }: { serverId: string }) => {
	const normalized = normalizeId(serverId);
	const rows = all<UserRow>(
		`SELECT u.* FROM users u
		 INNER JOIN server_memberships sm ON sm.user_id = u.id
		 WHERE sm.server_id = ?1`,
		[normalized],
	);

	return rows.map(mapRowToUser);
};

export const getWhitelistedUsers = async ({ serverId }: { serverId: string }) => {
	return all<{ user_id: string }>("SELECT user_id FROM whitelisted_users WHERE server_id = ?1", [
		normalizeId(serverId),
	]).map((record) => record.user_id);
};

export const checkIfUserIsWhitelisted = async ({
	userId,
	serverId,
}: {
	userId: string;
	serverId: string;
}) => {
	const record = get<{ user_id: string }>(
		"SELECT user_id FROM whitelisted_users WHERE server_id = ?1 AND user_id = ?2",
		[normalizeId(serverId), normalizeId(userId)],
	);

	return Boolean(record);
};

export const getServersForUser = async ({ userId }: { userId: string }) => {
	return all<{ server_id: string }>("SELECT server_id FROM server_memberships WHERE user_id = ?1", [
		normalizeId(userId),
	]).map((record) => record.server_id);
};
