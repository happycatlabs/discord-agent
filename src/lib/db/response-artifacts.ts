import { createLogger } from "../util/logger";
import { get, normalizeId, run } from ".";

export type ResponseArtifactRow = {
	id: number;
	server_id: string;
	channel_id: string;
	user_id: string;
	user_message_id: string;
	response_message_id: string;
	concise_text: string;
	full_text: string;
	sources_json: string | null;
	tool_trace_json: string | null;
	created_at: string;
	expires_at: string | null;
};

const serialize = (value: unknown) => JSON.stringify(value ?? null);
const logger = createLogger("db.responseArtifacts");

export const storeResponseArtifact = ({
	serverId,
	channelId,
	userId,
	userMessageId,
	conciseText,
	fullText,
	sources,
	toolTrace,
	expiresAt,
}: {
	serverId: string;
	channelId: string;
	userId: string;
	userMessageId: string;
	conciseText: string;
	fullText: string;
	sources?: unknown;
	toolTrace?: unknown;
	expiresAt?: string | null;
}) => {
	const result = run(
		`INSERT INTO response_artifacts (
			server_id,
			channel_id,
			user_id,
			user_message_id,
			concise_text,
			full_text,
			sources_json,
			tool_trace_json,
			expires_at
		) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
		[
			normalizeId(serverId || "dm"),
			channelId,
			normalizeId(userId),
			userMessageId,
			conciseText,
			fullText,
			serialize(sources),
			serialize(toolTrace),
			expiresAt ?? null,
		],
	);

	const artifactId = Number(result.lastInsertRowid);
	logger.debug("stored response artifact", {
		artifactId,
		serverId: normalizeId(serverId || "dm"),
		channelId,
		userId: normalizeId(userId),
		fullTextLength: fullText.length,
		conciseTextLength: conciseText.length,
		hasSources: Boolean(sources),
		expiresAt,
	});
	return artifactId;
};

export const updateResponseArtifactMessageId = ({
	artifactId,
	responseMessageId,
}: {
	artifactId: number;
	responseMessageId: string;
}) => {
	run("UPDATE response_artifacts SET response_message_id = ?1 WHERE id = ?2", [
		responseMessageId,
		artifactId,
	]);
	logger.debug("updated response artifact message id", {
		artifactId,
		responseMessageId,
	});
};

export const getResponseArtifactForUser = ({
	artifactId,
	userId,
}: {
	artifactId: number;
	userId: string;
}) => {
	const now = new Date().toISOString();
	return get<ResponseArtifactRow>(
		`SELECT *
		 FROM response_artifacts
		 WHERE id = ?1
		   AND user_id = ?2
		   AND (expires_at IS NULL OR expires_at > ?3)`,
		[artifactId, normalizeId(userId), now],
	);
};
