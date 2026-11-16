import { all, get, normalizeId, run, transaction } from ".";

export type SearchSource = {
	title?: string;
	url: string;
	description?: string;
	excerpts?: string[];
	source?: string;
	sourceKind?: string;
	provider?: string;
	publishDate?: string;
};

export type SearchSourceCapture = {
	query: string;
	sources: SearchSource[];
	diagnostics?: unknown;
};

type SearchSourceRow = {
	id: number;
	query: string;
	source_rank: number;
	title: string | null;
	url: string;
	source: string | null;
	source_kind: string | null;
	provider: string | null;
	published_at: string | null;
	snippet: string | null;
	response_message_id: string;
	created_at: string;
};

const serialize = (value: unknown) => JSON.stringify(value ?? null);
const MAX_SNIPPET_CHARS = 700;

const buildSnippet = (source: SearchSource) => {
	const text = [source.description, ...(Array.isArray(source.excerpts) ? source.excerpts : [])]
		.filter(Boolean)
		.join("\n")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return null;
	return text.length > MAX_SNIPPET_CHARS ? `${text.slice(0, MAX_SNIPPET_CHARS - 1).trim()}…` : text;
};

export const storeSearchSourcesForResponse = ({
	serverId,
	channelId,
	userId,
	userMessageId,
	responseMessageId,
	searches,
}: {
	serverId: string;
	channelId: string;
	userId: string;
	userMessageId: string;
	responseMessageId: string;
	searches: SearchSourceCapture[];
}) => {
	const normalizedServerId = normalizeId(serverId || "dm");
	const normalizedUserId = normalizeId(userId);

	const uniqueSearches = searches.filter((search) => search.sources.length > 0);
	if (uniqueSearches.length === 0) return;

	transaction(() => {
		for (const search of uniqueSearches) {
			const seenUrls = new Set<string>();
			search.sources.forEach((source, index) => {
				if (!source.url || seenUrls.has(source.url)) return;
				seenUrls.add(source.url);
				run(
					`INSERT INTO search_source_uses (
						server_id,
						channel_id,
						user_id,
						user_message_id,
						response_message_id,
						query,
						source_rank,
						title,
						url,
						source,
						source_kind,
							provider,
							published_at,
							snippet,
							diagnostics_json
						) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
					[
						normalizedServerId,
						channelId,
						normalizedUserId,
						userMessageId,
						responseMessageId,
						search.query,
						index + 1,
						source.title ?? null,
						source.url,
						source.source ?? null,
						source.sourceKind ?? null,
						source.provider ?? null,
						source.publishDate ?? null,
						buildSnippet(source),
						serialize(search.diagnostics),
					],
				);
			});
		}
	});
};

export const getLatestSearchSources = ({
	serverId,
	channelId,
	userId,
	limit = 10,
}: {
	serverId: string;
	channelId: string;
	userId: string;
	limit?: number;
}) => {
	const latest = get<{ response_message_id: string }>(
		`SELECT response_message_id
		 FROM search_source_uses
		 WHERE server_id = ?1 AND channel_id = ?2 AND user_id = ?3
		 ORDER BY datetime(created_at) DESC, id DESC
		 LIMIT 1`,
		[normalizeId(serverId || "dm"), channelId, normalizeId(userId)],
	);

	if (!latest) return [];

	return all<SearchSourceRow>(
		`SELECT *
		 FROM search_source_uses
		 WHERE response_message_id = ?1
		 ORDER BY query ASC, source_rank ASC
		 LIMIT ?2`,
		[latest.response_message_id, limit],
	);
};

export const formatSearchSources = (sources: SearchSourceRow[]) => {
	if (sources.length === 0) {
		return "i don't have stored sources for my last answer in this chat.";
	}

	const seenUrls = new Set<string>();
	const uniqueSources = sources.filter((source) => {
		if (seenUrls.has(source.url)) return false;
		seenUrls.add(source.url);
		return true;
	});

	return uniqueSources
		.map((source, index) => {
			const title = source.title || source.source || source.url;
			const kind = source.source_kind ? ` (${source.source_kind})` : "";
			return `${index + 1}. ${title}${kind}\n${source.url}`;
		})
		.join("\n");
};

export const formatSearchSourceContext = (sources: SearchSourceRow[]) => {
	if (sources.length === 0) return "";

	const seenUrls = new Set<string>();
	const uniqueSources = sources.filter((source) => {
		if (seenUrls.has(source.url)) return false;
		seenUrls.add(source.url);
		return true;
	});

	return uniqueSources
		.slice(0, 8)
		.map((source, index) => {
			const title = source.title || source.source || source.url;
			const snippet = source.snippet ? `\nSnippet: ${source.snippet}` : "";
			return `${index + 1}. ${title}\nQuery: ${source.query}\nURL: ${source.url}${snippet}`;
		})
		.join("\n\n");
};
