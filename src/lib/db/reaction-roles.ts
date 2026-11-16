import { all, get, normalizeId, run } from ".";

export interface ReactionRoleMessage {
	id: string;
	server_id: string;
	channel_id: string;
	name: string;
	mode: "normal" | "unique";
	created_by: string;
	created_at: string;
}

export interface ReactionRoleMapping {
	id: number;
	message_id: string;
	emoji: string;
	emoji_name: string | null;
	role_id: string;
	created_at: string;
}

export const createReactionRoleMessage = ({
	messageId,
	serverId,
	channelId,
	name,
	mode,
	createdBy,
}: {
	messageId: string;
	serverId: string;
	channelId: string;
	name: string;
	mode: "normal" | "unique";
	createdBy: string;
}) => {
	try {
		run(
			`INSERT INTO reaction_role_messages (id, server_id, channel_id, name, mode, created_by)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
			[
				normalizeId(messageId),
				normalizeId(serverId),
				normalizeId(channelId),
				name,
				mode,
				normalizeId(createdBy),
			],
		);
		return true;
	} catch (error) {
		console.log(`Error creating reaction role message: ${String(error)}`);
		return false;
	}
};

export const deleteReactionRoleMessage = ({ messageId }: { messageId: string }) => {
	try {
		run("DELETE FROM reaction_role_messages WHERE id = ?1", [normalizeId(messageId)]);
		return true;
	} catch (error) {
		console.log(`Error deleting reaction role message: ${String(error)}`);
		return false;
	}
};

export const getReactionRoleMessage = ({ messageId }: { messageId: string }) => {
	try {
		return get<ReactionRoleMessage>("SELECT * FROM reaction_role_messages WHERE id = ?1", [
			normalizeId(messageId),
		]);
	} catch (error) {
		console.log(`Error getting reaction role message: ${String(error)}`);
		return undefined;
	}
};

export const getReactionRoleMessagesForServer = ({ serverId }: { serverId: string }) => {
	try {
		return all<ReactionRoleMessage>(
			"SELECT * FROM reaction_role_messages WHERE server_id = ?1 ORDER BY created_at DESC",
			[normalizeId(serverId)],
		);
	} catch (error) {
		console.log(`Error getting reaction role messages for server: ${String(error)}`);
		return [];
	}
};

export const addReactionRoleMapping = ({
	messageId,
	emoji,
	emojiName,
	roleId,
}: {
	messageId: string;
	emoji: string;
	emojiName?: string;
	roleId: string;
}) => {
	try {
		run(
			`INSERT INTO reaction_role_mappings (message_id, emoji, emoji_name, role_id)
			 VALUES (?1, ?2, ?3, ?4)`,
			[normalizeId(messageId), emoji, emojiName ?? null, normalizeId(roleId)],
		);
		return true;
	} catch (error) {
		console.log(`Error adding reaction role mapping: ${String(error)}`);
		return false;
	}
};

export const removeReactionRoleMapping = ({
	messageId,
	emoji,
}: {
	messageId: string;
	emoji: string;
}) => {
	try {
		run("DELETE FROM reaction_role_mappings WHERE message_id = ?1 AND emoji = ?2", [
			normalizeId(messageId),
			emoji,
		]);
		return true;
	} catch (error) {
		console.log(`Error removing reaction role mapping: ${String(error)}`);
		return false;
	}
};

export const getRoleForEmoji = ({ messageId, emoji }: { messageId: string; emoji: string }) => {
	try {
		const record = get<{ role_id: string }>(
			"SELECT role_id FROM reaction_role_mappings WHERE message_id = ?1 AND emoji = ?2",
			[normalizeId(messageId), emoji],
		);
		return record?.role_id;
	} catch (error) {
		console.log(`Error getting role for emoji: ${String(error)}`);
		return undefined;
	}
};

export const getAllMappingsForMessage = ({ messageId }: { messageId: string }) => {
	try {
		return all<ReactionRoleMapping>("SELECT * FROM reaction_role_mappings WHERE message_id = ?1", [
			normalizeId(messageId),
		]);
	} catch (error) {
		console.log(`Error getting all mappings for message: ${String(error)}`);
		return [];
	}
};
