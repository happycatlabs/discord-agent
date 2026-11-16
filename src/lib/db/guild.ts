import type { Server } from "../types/server";
import { LogType, log } from "../util";
import { all, get, normalizeId, run, withPrefix } from ".";
import { getIgnoredUsersForServer } from "./guild/ignore-user";
import { getWhitelistedUsersForServer } from "./guild/whitelist-user";

type ServerRow = {
	id: string;
	name: string | null;
	banner: string | null;
	icon: string | null;
	owner: string | null;
	member_count: number | null;
	joined_at: string | null;
	created_at: string | null;
	log_channel: string | null;
	initialized_at: string | null;
	updated_at: string | null;
	guild_json: string | null;
};

type InviteRow = {
	code: string;
	channel_id: string | null;
	created_at: string | null;
	expires_at: string | null;
	guild_id: string | null;
	inviter: string | null;
	max_age: number | null;
	max_uses: number | null;
	target_user: string | null;
	uses: number | null;
	deleted: number | null;
	deleted_at: string | null;
};

const mapRowToServer = (row: ServerRow): Server => {
	const parsed = row.guild_json
		? (() => {
				try {
					return JSON.parse(row.guild_json) as Partial<Server>;
				} catch (error) {
					console.warn("Failed to parse server payload", error);
					return {};
				}
			})()
		: {};

	return {
		id: row.id,
		databaseID: withPrefix(row.id, "server"),
		name: row.name ?? parsed.name ?? "",
		banner: row.banner ?? parsed.banner ?? "",
		icon: row.icon ?? parsed.icon ?? "",
		owner: row.owner ?? parsed.owner ?? "",
		memberCount: row.member_count ?? parsed.memberCount ?? 0,
		joinedAt: row.joined_at ?? parsed.joinedAt ?? new Date().toISOString(),
		createdAt: row.created_at ?? parsed.createdAt ?? new Date().toISOString(),
		logChannel: row.log_channel ?? parsed.logChannel,
		initializedAt: row.initialized_at ?? parsed.initializedAt,
		ignoredChannels: [],
		ignoredUsers: [],
		ignoredCommands: parsed.ignoredCommands ?? [],
		ignoredEvents: parsed.ignoredEvents ?? [],
		ignoredRoles: parsed.ignoredRoles ?? [],
		ignoredCategories: parsed.ignoredCategories ?? [],
		whitelistedUsers: [],
		guild: parsed.guild,
	};
};

export const createServer = async (
	{ id, databaseID: _databaseID, ...guild }: Server,
	update = false,
) => {
	const initializedAt = new Date().toISOString();
	const serverId = normalizeId(id);
	const guildCreatedAt = guild.createdAt ? new Date(guild.createdAt).toISOString() : initializedAt;

	try {
		const existing = get<ServerRow>("SELECT * FROM servers WHERE id = ?1", [serverId]);

		if (existing && !update) {
			return {
				success: true,
				exists: true,
			};
		}

		if (existing && update) {
			run(
				`UPDATE servers SET
					name = ?1,
					banner = ?2,
					icon = ?3,
					owner = ?4,
					member_count = ?5,
					joined_at = ?6,
					created_at = ?7,
					log_channel = ?8,
					initialized_at = ?9,
					updated_at = ?10,
					guild_json = ?11
				WHERE id = ?12`,
				[
					guild.name,
					guild.banner ?? null,
					guild.icon ?? null,
					guild.owner ?? null,
					guild.memberCount ?? null,
					guild.joinedAt ?? null,
					guildCreatedAt,
					guild.logChannel ?? null,
					initializedAt,
					initializedAt,
					JSON.stringify(guild),
					serverId,
				],
			);

			console.log("✅ Server updated");

			return {
				success: true,
				exists: true,
			};
		}

		run(
			`INSERT INTO servers (
				id,
				name,
				banner,
				icon,
				owner,
				member_count,
				joined_at,
				created_at,
				log_channel,
				initialized_at,
				guild_json
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
			[
				serverId,
				guild.name,
				guild.banner ?? null,
				guild.icon ?? null,
				guild.owner ?? null,
				guild.memberCount ?? null,
				guild.joinedAt ?? null,
				guildCreatedAt,
				guild.logChannel ?? null,
				initializedAt,
				JSON.stringify(guild),
			],
		);

		log(`\n✅ Server ${guild.name} created.`);
		return {
			success: true,
			initializedAt,
		};
	} catch (error) {
		console.log("🔴 Error creating server", error);
		const existing = get<ServerRow>("SELECT * FROM servers WHERE id = ?1", [serverId]);

		return {
			success: false,
			exists: Boolean(existing),
			error,
			initializedAt: existing?.initialized_at ?? undefined,
		};
	}
};

export const storeInvite = async ({
	invite,
}: {
	invite: {
		channelId: string | null;
		createdAt: Date | null;
		expiresAt: Date | null;
		code: string | null;
		guild?: string | null;
		inviter: string | null;
		maxAge: number | null;
		maxUses: number | null;
		targetUser?: string | null;
		uses: number | null;
	};
}) => {
	if (!invite.code) return;

	const createdAt = invite.createdAt
		? new Date(invite.createdAt).toISOString()
		: new Date().toISOString();

	run(
		`INSERT INTO invites (
			code,
			channel_id,
			created_at,
			expires_at,
			guild_id,
			inviter,
			max_age,
			max_uses,
			target_user,
			uses,
			deleted,
			deleted_at
		) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, NULL)
		ON CONFLICT(code) DO UPDATE SET
			channel_id = excluded.channel_id,
			created_at = excluded.created_at,
			expires_at = excluded.expires_at,
			guild_id = excluded.guild_id,
			inviter = excluded.inviter,
			max_age = excluded.max_age,
			max_uses = excluded.max_uses,
			target_user = excluded.target_user,
			uses = excluded.uses,
			deleted = 0,
			deleted_at = NULL`,
		[
			invite.code,
			invite.channelId,
			createdAt,
			invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
			invite.guild ?? null,
			invite.inviter ?? null,
			invite.maxAge ?? null,
			invite.maxUses ?? null,
			invite.targetUser ?? null,
			invite.uses ?? null,
		],
	);

	log(`Invite from ${invite.inviter} stored.`, LogType.INVITE_CREATE);
};

export const deleteInvite = async ({ code }: { code: string }) => {
	run("UPDATE invites SET deleted = 1, deleted_at = ?1 WHERE code = ?2", [
		new Date().toISOString(),
		code,
	]);

	log(`Invite deleted (${code})`, LogType.INVITE_DELETE);
};

export const getInvite = async ({ code }: { code: string }) => {
	return get<InviteRow>("SELECT * FROM invites WHERE code = ?1", [code]);
};

export const unignoreChannel = async ({ id, guildId }: { id: string; guildId: string }) => {
	try {
		run("DELETE FROM ignored_channels WHERE server_id = ?1 AND channel_id = ?2", [
			normalizeId(guildId),
			normalizeId(id),
		]);

		return true;
	} catch (error) {
		console.log(`Error unignoring channel: ${String(error)}\n${JSON.stringify({ id, guildId })}`);
		return false;
	}
};

export const getServer = async ({ serverId }: { serverId?: string }) => {
	if (!serverId) {
		console.error("[getServer()] No server provided. Cannot log to channel.");
		return null;
	}

	try {
		const row = get<ServerRow>("SELECT * FROM servers WHERE id = ?1", [normalizeId(serverId)]);

		if (!row) {
			return null;
		}

		const server = mapRowToServer(row);

		const ignoredUsers = await getIgnoredUsersForServer({
			serverId: server.id,
		});

		const ignoredChannels = all<{ channel_id: string }>(
			"SELECT channel_id FROM ignored_channels WHERE server_id = ?1",
			[server.id],
		).map((record) => record.channel_id);

		const whitelistedUsers = await getWhitelistedUsersForServer({
			serverId: server.id,
		});

		return {
			...server,
			ignoredUsers,
			ignoredChannels,
			whitelistedUsers,
		};
	} catch (error) {
		console.error(error);
		return null;
	}
};

export const setChannel = async ({
	channel,
	server,
}: {
	channel: {
		id: string;
		name: string;
	};
	server: Server;
}) => {
	run("UPDATE servers SET log_channel = ?1, updated_at = ?2 WHERE id = ?3", [
		channel.id,
		new Date().toISOString(),
		normalizeId(server.id),
	]);

	log(`Log channel for "${server.name}" set to #${channel.name}.`);
};

export const storeImageSearch = async ({
	guildId,
	userId,
	query,
	count,
}: {
	guildId: string;
	userId: string;
	query: string;
	count: number;
}) => {
	try {
		run(
			`INSERT INTO image_searches (query, count, guild_id, user_id)
			 VALUES (?1, ?2, ?3, ?4)`,
			[query, count, normalizeId(guildId), normalizeId(userId)],
		);

		console.log("✅ Image search stored");
	} catch (error) {
		console.error("Failed to store image search", error);
	}
};
