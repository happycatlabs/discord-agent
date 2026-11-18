import { createLogger } from "../util/logger";

type Freshness = "day" | "week" | "month";

type AcquisitionProvider =
	| "brave_web"
	| "brave_news"
	| "parallel_search"
	| "parallel_extract"
	| "jina_search"
	| "jina_reader";

type AcquisitionStatus = "success" | "degraded" | "error";

type ReasonCode =
	| "missing_api_key"
	| "provider_error"
	| "empty_results"
	| "thin_content"
	| "not_applicable"
	| "cached";

type SourceKind =
	| "official"
	| "adaptation"
	| "fan_wiki"
	| "reference"
	| "news"
	| "community"
	| "unknown";

type Attempt = {
	provider: AcquisitionProvider;
	status: AcquisitionStatus;
	reason?: ReasonCode;
	latencyMs: number;
	cached?: boolean;
	error?: string;
};

type NormalizedSearchResult = {
	title: string;
	url: string;
	description: string;
	publishDate?: string;
	source: string;
	sourceKind: SourceKind;
	excerpts: string[];
	provider: AcquisitionProvider;
};

type ReadResult = {
	url: string;
	title?: string;
	content: string;
	provider: AcquisitionProvider;
	status: AcquisitionStatus;
	reasonCodes: ReasonCode[];
};

type SearchProviderResult = {
	provider: AcquisitionProvider;
	results: NormalizedSearchResult[];
	attempt: Attempt;
};

type ReadProviderResult = {
	read: ReadResult;
	attempt: Attempt;
};

type ParallelExtractResponse = {
	results?: Array<{
		url?: string;
		title?: string;
		excerpts?: string[];
		full_content?: string;
	}>;
};

const logger = createLogger("ai.acquisition");

const FETCH_TIMEOUT_MS = Number(process.env.WEB_FETCH_TIMEOUT_MS ?? "12000");
const SEARCH_PROVIDER_BUDGET_MS = Number(process.env.WEB_SEARCH_PROVIDER_BUDGET_MS ?? "3500");
const SEARCH_PROVIDER_GRACE_MS = Number(process.env.WEB_SEARCH_PROVIDER_GRACE_MS ?? "500");
const READ_PROVIDER_BUDGET_MS = Number(process.env.WEB_READ_PROVIDER_BUDGET_MS ?? "4500");
const READ_PROVIDER_GRACE_MS = Number(process.env.WEB_READ_PROVIDER_GRACE_MS ?? "500");
const MAX_READ_URL_COUNT = Number(process.env.WEB_READ_URL_COUNT ?? "1");
const THIN_CONTENT_CHAR_THRESHOLD = 600;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESULT_DESCRIPTION_CHARS = 700;
const MAX_RESULT_EXCERPT_CHARS = 700;
const MAX_SOURCE_CONTEXT_CHARS = 3200;
const MAX_SOURCE_CONTEXT_CHUNK_CHARS = 1000;
const MAX_PROVIDER_ERROR_CHARS = 500;
const MAX_SEARCH_RESULT_COUNT = 6;

const BRAVE_FRESHNESS_MAP: Record<Freshness, string> = {
	day: "pd",
	week: "pw",
	month: "pm",
};

type CacheEntry<T> = {
	expiresAt: number;
	createdAt: number;
	contentHash: string;
	value: T;
};

const searchCache = new Map<string, CacheEntry<SearchProviderResult>>();
const readCache = new Map<string, CacheEntry<ReadProviderResult>>();

export type SearchWebAcquisitionParams = {
	q: string;
	count?: number;
	freshness?: Freshness;
};

const optionalEnv = (name: string) => process.env[name]?.trim() || "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const truncateText = (value: string, maxChars: number) => {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, maxChars - 1).trim()}…`;
};

const truncateList = (values: unknown[], maxChars: number) =>
	values.filter(Boolean).map((value) => truncateText(String(value), maxChars));

const hostnameFromUrl = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
};

const classifySourceKind = (url: string, provider?: AcquisitionProvider): SourceKind => {
	const host = hostnameFromUrl(url).toLowerCase();
	if (provider === "brave_news") return "news";
	if (
		/(^|\.)official\.|scholastic|nintendo|crunchyroll|kodansha|lionsgate|warnerbros|sony|netflix/.test(
			host,
		)
	) {
		return "official";
	}
	if (/(imdb|rottentomatoes|letterboxd|boxofficemojo)/.test(host)) return "adaptation";
	if (/(^|\.)fandom\.com$|wiki\.gg|miraheze|fanlore/.test(host)) return "fan_wiki";
	if (/(wikipedia|britannica|animenewsnetwork)/.test(host)) return "reference";
	if (/(deadline|variety|hollywoodreporter|gamesradar|ign|polygon|theverge)/.test(host)) {
		return "news";
	}
	if (/(reddit|quora|facebook|tiktok|pinterest|x\.com|twitter)/.test(host)) return "community";
	return "unknown";
};

const isRecentQuery = (query: string, freshness?: Freshness) => {
	if (freshness) return true;
	return /\b(latest|recent|today|yesterday|tomorrow|this week|this month|release|released|premiere|premiered|stream|streaming|available|availability|news|announcement|announced|current|2025|2026)\b/i.test(
		query,
	);
};

const withTimeout = async (url: string, init: RequestInit = {}) => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeoutId);
	}
};

const timed = async <T>(
	provider: AcquisitionProvider,
	fn: () => Promise<T>,
): Promise<{ value?: T; attempt: Attempt }> => {
	const startedAt = Date.now();
	try {
		const value = await fn();
		return {
			value,
			attempt: {
				provider,
				status: "success",
				latencyMs: Date.now() - startedAt,
			},
		};
	} catch (error) {
		return {
			attempt: {
				provider,
				status: "error",
				reason: error instanceof MissingApiKeyError ? "missing_api_key" : "provider_error",
				latencyMs: Date.now() - startedAt,
				error: truncateText(
					error instanceof Error ? error.message : String(error),
					MAX_PROVIDER_ERROR_CHARS,
				),
			},
		};
	}
};

const collectWithBudget = async <T>({
	label,
	tasks,
	budgetMs,
	graceMs,
	isUseful,
}: {
	label: string;
	tasks: Promise<T>[];
	budgetMs: number;
	graceMs: number;
	isUseful: (value: T) => boolean;
}) => {
	const startedAt = Date.now();
	const completed: T[] = [];
	let settled = 0;

	for (const task of tasks) {
		task
			.then((value) => {
				completed.push(value);
			})
			.catch((error) => {
				logger.warn(`${label} task failed`, {
					error: error instanceof Error ? error.message : String(error),
				});
			})
			.finally(() => {
				settled += 1;
			});
	}

	while (Date.now() - startedAt < budgetMs) {
		if (settled === tasks.length) break;
		if (completed.some(isUseful)) {
			await sleep(Math.min(graceMs, Math.max(0, budgetMs - (Date.now() - startedAt))));
			break;
		}
		await sleep(Math.min(50, Math.max(0, budgetMs - (Date.now() - startedAt))));
	}

	logger.info(`${label} budget complete`, {
		durationMs: Date.now() - startedAt,
		completed: completed.length,
		settled,
		total: tasks.length,
		useful: completed.filter(isUseful).length,
		budgetMs,
	});

	return completed;
};

class MissingApiKeyError extends Error {}

const requireKey = (name: string) => {
	const value = optionalEnv(name);
	if (!value) throw new MissingApiKeyError(`Missing ${name}`);
	return value;
};

const hashCacheValue = (value: unknown) => {
	const serialized = JSON.stringify(value);
	let hash = 2166136261;
	for (let index = 0; index < serialized.length; index += 1) {
		hash ^= serialized.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
};

const getCached = <T>(cache: Map<string, CacheEntry<T>>, key: string) => {
	const cached = cache.get(key);
	if (!cached || cached.expiresAt < Date.now()) {
		if (cached) cache.delete(key);
		return undefined;
	}
	return cached.value;
};

const setCached = <T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) => {
	cache.set(key, {
		expiresAt: Date.now() + CACHE_TTL_MS,
		createdAt: Date.now(),
		contentHash: hashCacheValue(value),
		value,
	});
};

const markCachedSearch = (cached: SearchProviderResult): SearchProviderResult => ({
	...cached,
	attempt: {
		...cached.attempt,
		latencyMs: 0,
		cached: true,
		reason: "cached",
	},
});

const markCachedRead = (cached: ReadProviderResult): ReadProviderResult => ({
	...cached,
	attempt: {
		...cached.attempt,
		latencyMs: 0,
		cached: true,
		reason: "cached",
	},
});

const normalizeBraveWeb = (payload: any, limit: number): NormalizedSearchResult[] => {
	const results = payload?.web?.results ?? payload?.mixed?.main ?? [];
	return results
		.filter((result: any) => typeof result.url === "string")
		.slice(0, limit)
		.map((result: any) => {
			const snippets = Array.isArray(result.extra_snippets) ? result.extra_snippets : [];
			const description = [result.description || result.snippet || "", ...snippets]
				.filter(Boolean)
				.map((value) => String(value).trim())
				.join("\n");
			const excerpt = truncateText(description, MAX_RESULT_DESCRIPTION_CHARS);
			return {
				title: String(result.title || "").trim(),
				url: result.url,
				description: excerpt,
				publishDate: result.age,
				source: result.meta_url?.hostname || hostnameFromUrl(result.url),
				sourceKind: classifySourceKind(result.url, "brave_web"),
				excerpts: [excerpt].filter(Boolean),
				provider: "brave_web" as const,
			};
		});
};

const normalizeBraveNews = (payload: any, limit: number): NormalizedSearchResult[] => {
	const results = payload?.news?.results ?? payload?.results ?? [];
	return results
		.filter((result: any) => typeof result.url === "string")
		.slice(0, limit)
		.map((result: any) => ({
			title: String(result.title || "").trim(),
			url: result.url,
			description: truncateText(String(result.description || ""), MAX_RESULT_DESCRIPTION_CHARS),
			publishDate: result.age,
			source: result.meta_url?.hostname || hostnameFromUrl(result.url),
			sourceKind: classifySourceKind(result.url, "brave_news"),
			excerpts: truncateList([result.description], MAX_RESULT_EXCERPT_CHARS),
			provider: "brave_news" as const,
		}));
};

const normalizeParallelSearch = (payload: any, limit: number): NormalizedSearchResult[] =>
	(payload?.results ?? [])
		.filter((result: any) => typeof result.url === "string")
		.slice(0, limit)
		.map((result: any) => ({
			title: String(result.title || "").trim(),
			url: result.url,
			description: Array.isArray(result.excerpts)
				? truncateText(result.excerpts.join("\n"), MAX_RESULT_DESCRIPTION_CHARS)
				: "",
			publishDate: result.publish_date,
			source: hostnameFromUrl(result.url),
			sourceKind: classifySourceKind(result.url, "parallel_search"),
			excerpts: Array.isArray(result.excerpts)
				? truncateList(result.excerpts, MAX_RESULT_EXCERPT_CHARS)
				: [],
			provider: "parallel_search" as const,
		}));

const normalizeJinaSearch = (payload: any, limit: number): NormalizedSearchResult[] => {
	const results = Array.isArray(payload) ? payload : (payload?.data ?? payload?.results ?? []);
	return results
		.filter((result: any) => typeof result.url === "string")
		.slice(0, limit)
		.map((result: any) => ({
			title: String(result.title || "").trim(),
			url: result.url,
			description: truncateText(
				String(result.content || result.description || ""),
				MAX_RESULT_DESCRIPTION_CHARS,
			),
			publishDate: result.publishedTime || result.date,
			source: hostnameFromUrl(result.url),
			sourceKind: classifySourceKind(result.url, "jina_search"),
			excerpts: truncateList([result.content || result.description], MAX_RESULT_EXCERPT_CHARS),
			provider: "jina_search" as const,
		}));
};

const searchBraveWebProvider = async (
	query: string,
	limit: number,
	freshness?: Freshness,
): Promise<SearchProviderResult> => {
	const cacheKey = `brave_web:${query}:${limit}:${freshness ?? ""}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return markCachedSearch(cached);

	const { value, attempt } = await timed("brave_web", async () => {
		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(limit));
		url.searchParams.set("country", "US");
		url.searchParams.set("search_lang", "en");
		url.searchParams.set("spellcheck", "1");
		url.searchParams.set("extra_snippets", "true");
		if (freshness) url.searchParams.set("freshness", BRAVE_FRESHNESS_MAP[freshness]);

		const response = await withTimeout(url.toString(), {
			headers: { "X-Subscription-Token": requireKey("BRAVE_API_KEY") },
		});
		if (!response.ok) throw new Error(`Brave web ${response.status}: ${await response.text()}`);
		return response.json();
	});
	const result = {
		provider: "brave_web" as const,
		results: value ? normalizeBraveWeb(value, limit) : [],
		attempt,
	};
	if (result.results.length === 0 && result.attempt.status === "success") {
		result.attempt.status = "degraded";
		result.attempt.reason = "empty_results";
	}
	setCached(searchCache, cacheKey, result);
	return result;
};

const searchBraveNewsProvider = async (
	query: string,
	limit: number,
	freshness: Freshness = "month",
): Promise<SearchProviderResult> => {
	const cacheKey = `brave_news:${query}:${limit}:${freshness}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return markCachedSearch(cached);

	const { value, attempt } = await timed("brave_news", async () => {
		const url = new URL("https://api.search.brave.com/res/v1/news/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(limit));
		url.searchParams.set("country", "US");
		url.searchParams.set("search_lang", "en");
		url.searchParams.set("extra_snippets", "true");
		url.searchParams.set("freshness", BRAVE_FRESHNESS_MAP[freshness]);

		const response = await withTimeout(url.toString(), {
			headers: { "X-Subscription-Token": requireKey("BRAVE_API_KEY") },
		});
		if (!response.ok) throw new Error(`Brave news ${response.status}: ${await response.text()}`);
		return response.json();
	});
	const result = {
		provider: "brave_news" as const,
		results: value ? normalizeBraveNews(value, limit) : [],
		attempt,
	};
	if (result.results.length === 0 && result.attempt.status === "success") {
		result.attempt.status = "degraded";
		result.attempt.reason = "empty_results";
	}
	setCached(searchCache, cacheKey, result);
	return result;
};

const searchParallelProvider = async (
	query: string,
	limit: number,
): Promise<SearchProviderResult> => {
	const cacheKey = `parallel_search:${query}:${limit}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return markCachedSearch(cached);

	const { value, attempt } = await timed("parallel_search", async () => {
		const response = await withTimeout("https://api.parallel.ai/v1/search", {
			method: "POST",
			headers: {
				"x-api-key": requireKey("PARALLEL_API_KEY"),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				objective: `Find source-grounded pages to answer: ${query}`,
				search_queries: [query],
				mode: "advanced",
				max_chars_total: Math.max(3000, limit * 900),
				client_model: "gpt-5.5",
			}),
		});
		if (!response.ok)
			throw new Error(`Parallel search ${response.status}: ${await response.text()}`);
		return response.json();
	});
	const result = {
		provider: "parallel_search" as const,
		results: value ? normalizeParallelSearch(value, limit) : [],
		attempt,
	};
	if (result.results.length === 0 && result.attempt.status === "success") {
		result.attempt.status = "degraded";
		result.attempt.reason = "empty_results";
	}
	setCached(searchCache, cacheKey, result);
	return result;
};

const searchJinaProvider = async (query: string, limit: number): Promise<SearchProviderResult> => {
	const cacheKey = `jina_search:${query}:${limit}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return markCachedSearch(cached);

	const { value, attempt } = await timed("jina_search", async () => {
		const response = await withTimeout(`https://s.jina.ai/${encodeURIComponent(query)}`, {
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${requireKey("JINA_API_KEY")}`,
			},
		});
		if (!response.ok) throw new Error(`Jina search ${response.status}: ${await response.text()}`);
		return response.json();
	});
	const result = {
		provider: "jina_search" as const,
		results: value ? normalizeJinaSearch(value, limit) : [],
		attempt,
	};
	if (result.results.length === 0 && result.attempt.status === "success") {
		result.attempt.status = "degraded";
		result.attempt.reason = "empty_results";
	}
	setCached(searchCache, cacheKey, result);
	return result;
};

const contentQuality = (content: string) => {
	const compact = content.replace(/\s+/g, " ").trim();
	if (!compact) return { status: "error" as const, reasonCodes: ["empty_results" as const] };
	if (compact.length < THIN_CONTENT_CHAR_THRESHOLD) {
		return { status: "degraded" as const, reasonCodes: ["thin_content" as const] };
	}
	return { status: "success" as const, reasonCodes: [] };
};

const readJinaProvider = async (url: string): Promise<ReadProviderResult> => {
	const cacheKey = `jina_reader:${url}`;
	const cached = getCached(readCache, cacheKey);
	if (cached) return markCachedRead(cached);

	const { value, attempt } = await timed("jina_reader", async () => {
		const response = await withTimeout(`https://r.jina.ai/${url}`, {
			headers: {
				Authorization: `Bearer ${requireKey("JINA_API_KEY")}`,
				"X-Return-Format": "markdown",
			},
		});
		if (!response.ok) throw new Error(`Jina reader ${response.status}: ${await response.text()}`);
		return response.text();
	});
	const quality = contentQuality(value ?? "");
	const result = {
		read: {
			url,
			content: value ?? "",
			provider: "jina_reader" as const,
			status: value ? quality.status : "error",
			reasonCodes: value ? quality.reasonCodes : ["provider_error" as const],
		},
		attempt: value
			? { ...attempt, status: quality.status, reason: quality.reasonCodes[0] }
			: attempt,
	};
	setCached(readCache, cacheKey, result);
	return result;
};

const readParallelProvider = async (url: string, query: string): Promise<ReadProviderResult> => {
	const cacheKey = `parallel_extract:${url}:${query}`;
	const cached = getCached(readCache, cacheKey);
	if (cached) return markCachedRead(cached);

	const { value, attempt } = await timed<ParallelExtractResponse>("parallel_extract", async () => {
		const response = await withTimeout("https://api.parallel.ai/v1/extract", {
			method: "POST",
			headers: {
				"x-api-key": requireKey("PARALLEL_API_KEY"),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				urls: [url],
				objective: `Extract source text needed to answer: ${query}`,
				search_queries: [query],
				max_chars_total: 6000,
				client_model: "gpt-5.5",
			}),
		});
		if (!response.ok)
			throw new Error(`Parallel extract ${response.status}: ${await response.text()}`);
		return (await response.json()) as ParallelExtractResponse;
	});
	const item = value?.results?.find((result: any) => result.url === url) ?? value?.results?.[0];
	const content = item?.full_content ?? item?.excerpts?.filter(Boolean).join("\n\n") ?? "";
	const quality = contentQuality(content);
	const result = {
		read: {
			url,
			title: item?.title,
			content,
			provider: "parallel_extract" as const,
			status: value ? quality.status : "error",
			reasonCodes: value ? quality.reasonCodes : ["provider_error" as const],
		},
		attempt: value
			? { ...attempt, status: quality.status, reason: quality.reasonCodes[0] }
			: attempt,
	};
	setCached(readCache, cacheKey, result);
	return result;
};

const uniqueByUrl = (results: NormalizedSearchResult[]) => {
	const seen = new Set<string>();
	return results.filter((result) => {
		if (!result.url || seen.has(result.url)) return false;
		seen.add(result.url);
		return true;
	});
};

const sourceAuthorityRank = (url: string) => {
	const sourceKind = classifySourceKind(url);
	if (sourceKind === "official" || sourceKind === "news") return 3;
	if (sourceKind === "reference" || sourceKind === "fan_wiki" || sourceKind === "adaptation") {
		return 2;
	}
	if (sourceKind === "community") return 0;
	return 1;
};

const rankSearchResult = (result: NormalizedSearchResult) => {
	const authority = sourceAuthorityRank(result.url);
	const content = Math.min(3, Math.floor((result.description?.length ?? 0) / 500));
	const current = /2025|2026|today|hour|day|week|month|premiere|release|stream/i.test(
		`${result.publishDate ?? ""} ${result.description}`,
	)
		? 1
		: 0;
	return authority * 4 + content + current;
};

const buildSourceContext = (reads: ReadResult[], maxChars = MAX_SOURCE_CONTEXT_CHARS) => {
	let remaining = maxChars;
	const chunks: string[] = [];
	for (const read of reads) {
		if (read.status === "error" || !read.content.trim()) continue;
		const excerpt = truncateText(read.content, Math.min(MAX_SOURCE_CONTEXT_CHUNK_CHARS, remaining));
		if (!excerpt) continue;
		chunks.push(`Source: ${read.url}\nProvider: ${read.provider}\nContent: ${excerpt}`);
		remaining -= excerpt.length;
		if (remaining <= 0) break;
	}
	return chunks.join("\n\n---\n\n");
};

const buildDiagnostics = (params: {
	query: string;
	providerResults: SearchProviderResult[];
	readResults: ReadProviderResult[];
	finalResults: NormalizedSearchResult[];
}) => {
	const attempts = [
		...params.providerResults.map((result) => result.attempt),
		...params.readResults.map((result) => result.attempt),
	];
	const sourceCount = new Set(params.finalResults.map((result) => result.url)).size;
	const primarySourceCount = params.finalResults.filter(
		(result) => result.sourceKind === "official",
	).length;
	const queryNeedsFreshness = isRecentQuery(params.query);
	const staleSourceCount = params.finalResults.filter(
		(result) =>
			queryNeedsFreshness &&
			!result.publishDate &&
			result.sourceKind !== "official" &&
			result.sourceKind !== "news",
	).length;
	const thinContentCount = params.readResults.filter((result) =>
		result.read.reasonCodes.includes("thin_content"),
	).length;
	const bestSearch =
		params.providerResults
			.filter((result) => result.results.length > 0)
			.sort((a, b) => {
				const aTop = a.results
					.slice(0, 5)
					.reduce((sum, result) => sum + rankSearchResult(result), 0);
				const bTop = b.results
					.slice(0, 5)
					.reduce((sum, result) => sum + rankSearchResult(result), 0);
				return bTop - aTop || a.attempt.latencyMs - b.attempt.latencyMs;
			})[0]?.provider ?? "brave_web";
	const bestRead =
		params.readResults
			.filter((result) => result.read.status === "success")
			.sort((a, b) => {
				const completeness = b.read.content.length - a.read.content.length;
				return completeness || a.attempt.latencyMs - b.attempt.latencyMs;
			})[0]?.read.provider ?? "jina_reader";

	return {
		query: params.query,
		providersTested: Array.from(new Set(attempts.map((attempt) => attempt.provider))),
		bestProviderForSearch: bestSearch,
		bestProviderForReading: bestRead,
		sourceCount,
		primarySourceCount,
		staleSourceCount,
		thinContentCount,
		disagreements: [],
		recommendation:
			"Use Brave Web for fast discovery, add Brave News for current/news queries, then read selected URLs with Jina Reader and fall back to Parallel Extract for speed or Jina failures.",
		attempts,
	};
};

export const searchWebAcquisition = async ({
	q,
	count = 6,
	freshness,
}: SearchWebAcquisitionParams) => {
	const startedAt = Date.now();
	const query = q.trim();
	if (!query) {
		return { success: false, error: "Search query is required." };
	}
	const resultCount = Math.min(Math.max(count, 1), MAX_SEARCH_RESULT_COUNT);

	const recent = isRecentQuery(query, freshness);
	const searchProviders = [
		searchBraveWebProvider(query, resultCount, freshness),
		...(recent ? [searchBraveNewsProvider(query, resultCount, freshness ?? "month")] : []),
		searchParallelProvider(query, resultCount),
		searchJinaProvider(query, resultCount),
	];
	logger.info("web search started", {
		queryLength: query.length,
		resultCount,
		recent,
		searchProviderBudgetMs: SEARCH_PROVIDER_BUDGET_MS,
		readProviderBudgetMs: READ_PROVIDER_BUDGET_MS,
	});
	const providerResults = await collectWithBudget({
		label: "search providers",
		tasks: searchProviders,
		budgetMs: SEARCH_PROVIDER_BUDGET_MS,
		graceMs: SEARCH_PROVIDER_GRACE_MS,
		isUseful: (result) => result.results.length > 0,
	});
	const rankedResults = uniqueByUrl(
		providerResults
			.flatMap((result) => result.results)
			.sort((a, b) => rankSearchResult(b) - rankSearchResult(a)),
	).slice(0, resultCount);

	const urlsToRead = rankedResults.slice(
		0,
		Math.min(Math.max(MAX_READ_URL_COUNT, 0), rankedResults.length),
	);
	const readTasks = urlsToRead.flatMap((result) => [
		readJinaProvider(result.url),
		readParallelProvider(result.url, query),
	]);
	const readResults = (
		readTasks.length === 0
			? []
			: await collectWithBudget({
					label: "read providers",
					tasks: readTasks,
					budgetMs: READ_PROVIDER_BUDGET_MS,
					graceMs: READ_PROVIDER_GRACE_MS,
					isUseful: (result) => result.read.status !== "error",
				})
	).sort((a, b) => {
		const aSuccess = a.read.status === "success" ? 1 : 0;
		const bSuccess = b.read.status === "success" ? 1 : 0;
		return bSuccess - aSuccess || b.read.content.length - a.read.content.length;
	});
	const successfulReads = uniqueByUrl(
		readResults
			.filter((result) => result.read.status !== "error")
			.map((result) => ({
				title: result.read.title ?? "",
				url: result.read.url,
				description: result.read.content,
				source: hostnameFromUrl(result.read.url),
				sourceKind: classifySourceKind(result.read.url, result.read.provider),
				excerpts: [result.read.content],
				provider: result.read.provider,
			})),
	).map((result) => ({
		url: result.url,
		title: result.title,
		content: result.description,
		provider: result.provider,
		status: "success" as const,
		reasonCodes: [] as ReasonCode[],
	}));
	const sourceContext = buildSourceContext(successfulReads);
	const diagnostics = buildDiagnostics({
		query,
		providerResults,
		readResults,
		finalResults: rankedResults,
	});
	const output = {
		success: true,
		message:
			"Search completed with provider audit. Use sourceContext, results, and diagnostics to answer concisely. Do not include source links unless the user explicitly asked for sources, links, or citations.",
		results: rankedResults,
		sourceContext,
		diagnostics,
	};
	const outputChars = JSON.stringify(output).length;
	logger.info("web search completed", {
		queryLength: query.length,
		resultCount,
		durationMs: Date.now() - startedAt,
		providersCompleted: providerResults.map((result) => result.provider),
		readAttemptsCompleted: readResults.map((result) => result.read.provider),
		rankedResults: rankedResults.length,
		successfulReads: successfulReads.length,
		outputChars,
		estimatedTokens: Math.ceil(outputChars / 4),
		sourceContextChars: sourceContext.length,
	});
	return output;
};
