import { captureException } from "@sentry/node";
import { all, get, normalizeId, run, withPrefix } from ".";
import type { StoredMessage } from "../types/messages";
import { LogType, log } from "../util";

type MessageRow = {
	id: string;
	content: string | null;
	server_id: string;
	channel_id: string | null;
	created_at: string;
	updated_at: string | null;
	author_id: string;
	attachments_json: string | null;
	deleted: number;
	deleted_at: string | null;
	edits_json: string;
	raw_json: string | null;
};

const parseAttachments = (value: string | null) => {
	if (!value) return null;
	try {
		return JSON.parse(value);
	} catch (error) {
		console.warn("Failed to parse attachments JSON", error);
		return null;
	}
};

const serialize = (value: unknown) => JSON.stringify(value ?? null);

const mapRowToMessage = (row: MessageRow): StoredMessage => {
	return {
		id: row.id,
		content: row.content ?? "",
		server: withPrefix(row.server_id, "server"),
		channel: row.channel_id ?? "",
		createdAt: new Date(row.created_at),
		author: row.author_id,
		attachments: parseAttachments(row.attachments_json) ?? undefined,
	};
};

export const getMessagesFromUser = async ({
	userId,
	serverId,
}: {
	userId: string;
	serverId: string;
}) => {
	try {
		return all<MessageRow>(
			`SELECT * FROM messages
			 WHERE author_id = ?1 AND server_id = ?2
			 ORDER BY datetime(created_at) DESC
			 LIMIT 10`,
			[normalizeId(userId), normalizeId(serverId)],
		).map(mapRowToMessage);
	} catch (error) {
		console.error("An error occurred while getting messages from user:", error);
		return [];
	}
};

export const deleteMessage = async ({ id }: { id: string }) => {
	try {
		run("UPDATE messages SET deleted = 1, deleted_at = ?1 WHERE id = ?2", [
			new Date().toISOString(),
			id,
		]);

		log(`🗑️  Message deleted (${id})`, LogType.MESSAGE_DELETE);
	} catch (error) {
		console.error("An error occurred while deleting message:", error);
	}
};

export const updateMessage = async ({
	author,
	id,
	oldMessage,
	newMessage,
}: {
	id: StoredMessage["id"];
	author: { tag?: string };
	oldMessage: StoredMessage["content"];
	newMessage: StoredMessage["content"];
}) => {
	try {
		const existing = get<MessageRow>("SELECT edits_json FROM messages WHERE id = ?1", [id]);

		const edits: unknown[] = existing?.edits_json
			? (() => {
					try {
						return JSON.parse(existing.edits_json ?? "[]");
					} catch (error) {
						console.warn("Failed to parse edits JSON", error);
						return [];
					}
				})()
			: [];

		edits.push({
			old: oldMessage,
			new: newMessage,
			editedAt: new Date().toISOString(),
		});

		run(
			`UPDATE messages
			 SET content = ?1,
			 	updated_at = ?2,
			 	edits_json = ?3
			 WHERE id = ?4`,
			[newMessage, new Date().toISOString(), JSON.stringify(edits), id],
		);

		const authorTag = author?.tag ?? "Unknown user";
		log(
			`💬 \x1b[33m${authorTag}\x1b[0m edited their message:\n\x1b[31mBefore:\x1b[0m ${oldMessage}\n\x1b[32mAfter:\x1b[0m ${newMessage}\n`,
			LogType.MESSAGE_UPDATE,
		);
	} catch (error) {
		console.error("An error occurred while updating message:", error);
	}
};

export const storeMessage = async ({
	message,
	server,
}: {
	message: StoredMessage;
	server: string;
}) => {
	try {
		const serverId = normalizeId(server);
		const authorId = normalizeId(String(message.author));
		const createdAt = new Date(message.createdAt).toISOString();
		run(
			`INSERT INTO messages (
				id,
				author_id,
				server_id,
				channel_id,
				content,
				attachments_json,
				created_at,
				raw_json
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			ON CONFLICT(id) DO UPDATE SET
				author_id = excluded.author_id,
				server_id = excluded.server_id,
				channel_id = excluded.channel_id,
				content = excluded.content,
				attachments_json = excluded.attachments_json,
				created_at = excluded.created_at,
				raw_json = excluded.raw_json`,
			[
				message.id,
				authorId,
				serverId,
				message.channel,
				message.content,
				serialize(message.attachments),
				createdAt,
				serialize(message),
			],
		);

		log(`💬 Stored message from \x1b[33m${authorId}\x1b[0m`, LogType.MESSAGE_CREATE);
	} catch (error) {
		console.error("An error occurred while storing message:", error);
	}
};

export const getLastAgentMessageFromChannel = async ({
	serverId,
	channelId,
}: {
	serverId: string;
	channelId: string;
}) => {
	const row = get<{
		message_id: string;
		content: string | null;
		payload_json: string;
		created_at: string;
		server_id: string;
		channel_id: string;
	}>(
		`SELECT * FROM agent_messages
		 WHERE server_id = ?1 AND channel_id = ?2
		 ORDER BY datetime(created_at) DESC
		 LIMIT 1`,
		[normalizeId(serverId), normalizeId(channelId)],
	);

	if (!row) return undefined;

	try {
		return JSON.parse(row.payload_json) as StoredMessage;
	} catch (error) {
		captureException(error, {
			level: "error",
			tags: {
				origin: "db.messages.getLastAgentMessageFromChannel",
				phase: "parsePayloadJson",
			},
			extra: { serverId, channelId, payloadJson: row.payload_json },
		});
		console.error("Failed to parse agent message payload", error);
		return undefined;
	}
};

export const storeAgentMessage = async ({
	message,
	serverId,
	channelId,
}: {
	message: StoredMessage;
	serverId: string;
	channelId: string;
}) => {
	try {
		run(
			`INSERT INTO agent_messages (
				server_id,
				channel_id,
				message_id,
				author_id,
				content,
				payload_json,
				created_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
			ON CONFLICT(server_id, channel_id) DO UPDATE SET
				message_id = excluded.message_id,
				author_id = excluded.author_id,
				content = excluded.content,
				payload_json = excluded.payload_json,
				created_at = excluded.created_at`,
			[
				normalizeId(serverId),
				normalizeId(channelId),
				message.id,
				normalizeId(String(message.author)),
				message.content,
				serialize(message),
				new Date(message.createdAt).toISOString(),
			],
		);
	} catch (error) {
		console.error("An error occurred while storing agent message:", error);
	}
};
