import { FEATURE_VECTOR_KB } from "../constants/flags";
import { embedText, GEMINI_EMBEDDING_DIMENSIONS, GEMINI_EMBEDDING_MODEL } from "../ai/embeddings";
import { createLogger } from "../util/logger";
import { all, get, normalizeId, run, transaction } from ".";

export type KnowledgeScope = "user" | "server" | "global";

export type KnowledgeEntryRow = {
	id: number;
	scope: KnowledgeScope;
	owner_user_id: string;
	server_id: string;
	created_by_user_id: string;
	title: string | null;
	source_type: string;
	source_url: string | null;
	metadata_json: string | null;
	created_at: string;
	updated_at: string | null;
};

export type KnowledgeSearchResult = {
	chunkId: number;
	entryId: number;
	scope: KnowledgeScope;
	title: string | null;
	text: string;
	sourceType: string;
	sourceUrl: string | null;
	distance: number;
	createdAt: string;
};

export type KnowledgeListResult = {
	id: number;
	scope: KnowledgeScope;
	title: string | null;
	sourceType: string;
	sourceUrl: string | null;
	createdAt: string;
	updatedAt: string | null;
	chunks: number;
};

export type KnowledgeContext = {
	userId: string;
	serverId?: string;
	isAdmin?: boolean;
};

const CHUNK_SIZE = 3600;
const CHUNK_OVERLAP = 300;
const logger = createLogger("db.knowledge");

const assertVectorKbEnabled = () => {
	if (!FEATURE_VECTOR_KB) {
		throw new Error("Vector knowledge base is disabled.");
	}
};

const serialize = (value: unknown) => JSON.stringify(value ?? null);

const normalizeScopeIds = ({
	scope,
	userId,
	serverId,
}: {
	scope: KnowledgeScope;
	userId: string;
	serverId?: string;
}) => {
	const normalizedUserId = normalizeId(userId);
	const normalizedServerId = normalizeId(serverId || "");

	if (scope === "user") {
		return { ownerUserId: normalizedUserId, serverId: "" };
	}
	if (scope === "server") {
		if (!normalizedServerId) throw new Error("Server-scoped knowledge requires a server.");
		return { ownerUserId: "", serverId: normalizedServerId };
	}
	return { ownerUserId: "", serverId: "" };
};

const assertCanWriteScope = (scope: KnowledgeScope, context: KnowledgeContext) => {
	if (!context.userId) throw new Error("Knowledge writes require a user.");
	if (scope === "user") return;
	if (scope === "server" && context.serverId && context.isAdmin) return;
	if (scope === "global" && context.isAdmin) return;
	throw new Error(`Not authorized to write ${scope}-scoped knowledge.`);
};

const assertCanDeleteEntry = (entry: KnowledgeEntryRow, context: KnowledgeContext) => {
	const userId = normalizeId(context.userId);
	const serverId = normalizeId(context.serverId || "");

	if (entry.scope === "user" && entry.owner_user_id === userId) return;
	if (entry.scope === "server" && entry.server_id === serverId && context.isAdmin) return;
	if (entry.scope === "global" && context.isAdmin) return;

	throw new Error("Not authorized to delete that knowledge entry.");
};

const chunkText = (text: string) => {
	const normalized = text
		.replace(/\s+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	if (normalized.length <= CHUNK_SIZE) return [normalized];

	const chunks: string[] = [];
	let start = 0;
	while (start < normalized.length) {
		const hardEnd = Math.min(start + CHUNK_SIZE, normalized.length);
		const slice = normalized.slice(start, hardEnd);
		const splitAt = Math.max(
			slice.lastIndexOf("\n\n"),
			slice.lastIndexOf(". "),
			slice.lastIndexOf(" "),
		);
		const end = splitAt > CHUNK_SIZE * 0.65 ? start + splitAt + 1 : hardEnd;
		chunks.push(normalized.slice(start, end).trim());
		if (end >= normalized.length) break;
		start = Math.max(0, end - CHUNK_OVERLAP);
	}
	return chunks.filter(Boolean);
};

const insertVector = ({
	chunkId,
	embedding,
	scope,
	ownerUserId,
	serverId,
}: {
	chunkId: number;
	embedding: Float32Array;
	scope: KnowledgeScope;
	ownerUserId: string;
	serverId: string;
}) => {
	run(
		`INSERT INTO knowledge_chunk_vectors(rowid, embedding, scope, owner_user_id, server_id)
		 VALUES (?1, ?2, ?3, ?4, ?5)`,
		[chunkId, embedding, scope, ownerUserId, serverId],
	);
};

export const storeKnowledgeEntry = async ({
	scope,
	title,
	text,
	sourceType = "note",
	sourceUrl,
	metadata,
	context,
}: {
	scope: KnowledgeScope;
	title?: string;
	text: string;
	sourceType?: string;
	sourceUrl?: string;
	metadata?: unknown;
	context: KnowledgeContext;
}) => {
	assertVectorKbEnabled();
	assertCanWriteScope(scope, context);

	const cleanText = text.trim();
	if (!cleanText) throw new Error("Knowledge text cannot be empty.");

	const { ownerUserId, serverId } = normalizeScopeIds({
		scope,
		userId: context.userId,
		serverId: context.serverId,
	});
	const chunks = chunkText(cleanText);
	const embeddings = await Promise.all(
		chunks.map((chunk) => embedText({ text: chunk, title, purpose: "document" })),
	);

	const result = transaction(() => {
		const entryResult = run(
			`INSERT INTO knowledge_entries (
				scope,
				owner_user_id,
				server_id,
				created_by_user_id,
				title,
				source_type,
				source_url,
				metadata_json
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
			[
				scope,
				ownerUserId,
				serverId,
				normalizeId(context.userId),
				title ?? null,
				sourceType,
				sourceUrl ?? null,
				serialize(metadata),
			],
		);
		const entryId = Number(entryResult.lastInsertRowid);

		chunks.forEach((chunk, index) => {
			const chunkResult = run(
				`INSERT INTO knowledge_chunks (
					entry_id,
					chunk_index,
					text,
					embedding_model,
					embedding_dimensions
				) VALUES (?1, ?2, ?3, ?4, ?5)`,
				[entryId, index, chunk, GEMINI_EMBEDDING_MODEL, GEMINI_EMBEDDING_DIMENSIONS],
			);
			insertVector({
				chunkId: Number(chunkResult.lastInsertRowid),
				embedding: embeddings[index],
				scope,
				ownerUserId,
				serverId,
			});
		});

		return { entryId, chunks: chunks.length, scope };
	});

	logger.info("stored knowledge entry", {
		entryId: result.entryId,
		chunks: result.chunks,
		scope,
		sourceType,
		serverScoped: Boolean(serverId),
		userScoped: Boolean(ownerUserId),
	});

	return result;
};

const searchScope = ({
	queryEmbedding,
	scope,
	ownerUserId,
	serverId,
	limit,
}: {
	queryEmbedding: Float32Array;
	scope: KnowledgeScope;
	ownerUserId: string;
	serverId: string;
	limit: number;
}) =>
	all<KnowledgeSearchResult>(
		`SELECT
			v.rowid AS chunkId,
			c.entry_id AS entryId,
			e.scope AS scope,
			e.title AS title,
			c.text AS text,
			e.source_type AS sourceType,
			e.source_url AS sourceUrl,
			v.distance AS distance,
			e.created_at AS createdAt
		 FROM knowledge_chunk_vectors v
		 JOIN knowledge_chunks c ON c.id = v.rowid
		 JOIN knowledge_entries e ON e.id = c.entry_id
		 WHERE v.embedding MATCH ?1
		   AND v.scope = ?2
		   AND v.owner_user_id = ?3
		   AND v.server_id = ?4
		   AND k = ?5
		 ORDER BY v.distance ASC`,
		[queryEmbedding, scope, ownerUserId, serverId, limit],
	);

export const searchKnowledge = async ({
	query,
	scope = "auto",
	limit = 6,
	context,
}: {
	query: string;
	scope?: KnowledgeScope | "auto" | "all";
	limit?: number;
	context: KnowledgeContext;
}) => {
	assertVectorKbEnabled();
	if (!context.userId) throw new Error("Knowledge search requires a user.");

	const queryEmbedding = await embedText({ text: query, purpose: "query" });
	const userId = normalizeId(context.userId);
	const serverId = normalizeId(context.serverId || "");
	const safeLimit = Math.max(1, Math.min(limit, 12));

	const scopes: Array<{ scope: KnowledgeScope; ownerUserId: string; serverId: string }> = [];
	if (scope === "auto" || scope === "all" || scope === "user") {
		scopes.push({ scope: "user", ownerUserId: userId, serverId: "" });
	}
	if ((scope === "auto" || scope === "all" || scope === "server") && serverId) {
		scopes.push({ scope: "server", ownerUserId: "", serverId });
	}
	if (scope === "auto" || scope === "all" || scope === "global") {
		scopes.push({ scope: "global", ownerUserId: "", serverId: "" });
	}

	const results = scopes.flatMap((scopeSpec) =>
		searchScope({
			queryEmbedding,
			...scopeSpec,
			limit: safeLimit,
		}),
	);

	const ranked = results.sort((a, b) => a.distance - b.distance).slice(0, safeLimit);

	logger.debug("searched knowledge", {
		scope,
		requestedScopes: scopes.map((scopeSpec) => scopeSpec.scope),
		resultCount: ranked.length,
		limit: safeLimit,
		hasServerScope: Boolean(serverId),
	});

	return ranked;
};

const listScope = ({
	scope,
	ownerUserId,
	serverId,
	limit,
}: {
	scope: KnowledgeScope;
	ownerUserId: string;
	serverId: string;
	limit: number;
}) =>
	all<KnowledgeListResult>(
		`SELECT
			e.id AS id,
			e.scope AS scope,
			e.title AS title,
			e.source_type AS sourceType,
			e.source_url AS sourceUrl,
			e.created_at AS createdAt,
			e.updated_at AS updatedAt,
			COUNT(c.id) AS chunks
		 FROM knowledge_entries e
		 LEFT JOIN knowledge_chunks c ON c.entry_id = e.id
		 WHERE e.scope = ?1
		   AND e.owner_user_id = ?2
		   AND e.server_id = ?3
		 GROUP BY e.id
		 ORDER BY datetime(e.created_at) DESC
		 LIMIT ?4`,
		[scope, ownerUserId, serverId, limit],
	);

export const listKnowledgeEntries = ({
	scope = "auto",
	limit = 20,
	context,
}: {
	scope?: KnowledgeScope | "auto" | "all";
	limit?: number;
	context: KnowledgeContext;
}) => {
	assertVectorKbEnabled();
	if (!context.userId) throw new Error("Knowledge listing requires a user.");

	const userId = normalizeId(context.userId);
	const serverId = normalizeId(context.serverId || "");
	const safeLimit = Math.max(1, Math.min(limit, 50));
	const scopes: Array<{ scope: KnowledgeScope; ownerUserId: string; serverId: string }> = [];

	if (scope === "auto" || scope === "all" || scope === "user") {
		scopes.push({ scope: "user", ownerUserId: userId, serverId: "" });
	}
	if ((scope === "auto" || scope === "all" || scope === "server") && serverId) {
		scopes.push({ scope: "server", ownerUserId: "", serverId });
	}
	if (scope === "auto" || scope === "all" || scope === "global") {
		scopes.push({ scope: "global", ownerUserId: "", serverId: "" });
	}

	const results = scopes.flatMap((scopeSpec) =>
		listScope({
			...scopeSpec,
			limit: safeLimit,
		}),
	);

	return results
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.slice(0, safeLimit);
};

export const deleteKnowledgeEntry = ({
	entryId,
	context,
}: {
	entryId: number;
	context: KnowledgeContext;
}) => {
	assertVectorKbEnabled();
	const entry = get<KnowledgeEntryRow>("SELECT * FROM knowledge_entries WHERE id = ?1", [entryId]);
	if (!entry) throw new Error("Knowledge entry not found.");
	assertCanDeleteEntry(entry, context);

	transaction(() => {
		const chunks = all<{ id: number }>("SELECT id FROM knowledge_chunks WHERE entry_id = ?1", [
			entryId,
		]);
		for (const chunk of chunks) {
			run("DELETE FROM knowledge_chunk_vectors WHERE rowid = ?1", [chunk.id]);
		}
		run("DELETE FROM knowledge_chunks WHERE entry_id = ?1", [entryId]);
		run("DELETE FROM knowledge_entries WHERE id = ?1", [entryId]);
	});

	logger.info("deleted knowledge entry", {
		entryId,
		scope: entry.scope,
	});

	return { entryId, deleted: true };
};
