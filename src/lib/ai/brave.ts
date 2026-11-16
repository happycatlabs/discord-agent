// endpoint: https://api.search.brave.com/res/v1/news/search
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_NEWS_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/news/search";
const FETCH_TIMEOUT_MS = 15000; // 15 second timeout

const BRAVE_FRESHNESS_MAP = {
	day: "pd",
	week: "pw",
	month: "pm",
} as const;

function toBraveFreshness(freshness?: "day" | "week" | "month") {
	return freshness ? BRAVE_FRESHNESS_MAP[freshness] : undefined;
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
	const abortController = new AbortController();
	const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...options,
			signal: abortController.signal,
		});
		clearTimeout(timeoutId);
		return response;
	} catch (error) {
		clearTimeout(timeoutId);
		throw error;
	}
}

export interface BraveNewsSearchParams {
	q: string;
	count?: number;
	freshness?: "day" | "week" | "month";
	textDecorations?: boolean;
	safeSearch?: "strict" | "moderate" | "off";
}

export interface BraveNewsSearchResult {
	title: string;
	url: string;
	description: string;
	published_time: string;
	publisher: string;
	age: string;
	img?: {
		src: string;
		width: number;
		height: number;
	};
}

type SearchProviderError = {
	success: false;
	error: string;
};

export interface BraveWebSearchParams {
	q: string;
	count?: number;
	offset?: number;
	safesearch?: "strict" | "moderate" | "off";
	freshness?: "day" | "week" | "month";
}

export interface BraveWebSearchResult {
	title: string;
	url: string;
	description: string;
}

/**
 * Search for recent news articles using the Brave Search API.
 *
 * This function allows retrieval of up-to-date information on current events, trending topics,
 * or any subject requiring recent news coverage. It provides timely and relevant information
 * from reputable news sources.
 *
 * @param {BraveNewsSearchParams} params - The parameters for the news search.
 * @param {string} params.q - The search query for news articles. Be specific and use keywords relevant to the desired news topic.
 * @param {number} [params.count] - The number of news articles to return. Lower count (e.g., 5-10) for quick updates, higher count (e.g., 20-30) for comprehensive coverage.
 * @param {('day'|'week'|'month')} [params.freshness] - Filter results by recency. Use "day" for breaking news, "week" for recent developments, "month" for broader recent context.
 * @param {boolean} [params.textDecorations] - Whether to include text decorations in the results.
 * @param {('strict'|'moderate'|'off')} [params.safeSearch] - Safe search setting. "strict" for highest content filtering, "moderate" for balanced, "off" for unfiltered results.
 * @returns {Promise<Partial<BraveNewsSearchResult>[]>} A promise that resolves to an array of partial news search results.
 */
export async function searchBraveNews({
	q,
	count,
	freshness,
	textDecorations,
	safeSearch,
}: BraveNewsSearchParams): Promise<Partial<BraveNewsSearchResult>[] | SearchProviderError> {
	console.log(`🔍 Searching Brave News for: "${q}"`);
	try {
		const url = new URL(BRAVE_NEWS_SEARCH_ENDPOINT);
		const params = {
			q,
			count,
			freshness: toBraveFreshness(freshness),
			text_decorations: textDecorations,
			safesearch: safeSearch,
			country: "us",
			search_lang: "en",
			spellcheck: 1,
			extra_snippets: true,
		};

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				url.searchParams.append(key, value.toString());
			}
		}

		console.log(`🌐 Fetching from URL: ${url.toString()}`);
		const response = await fetchWithTimeout(url.toString(), {
			method: "GET",
			headers: {
				Accept: "application/json",
				"X-Subscription-Token": BRAVE_API_KEY || "",
			},
		});

		if (!response.ok) {
			console.error(`❌ HTTP error! status: ${response.status}`);
			const errorText = await response.text().catch(() => "Unable to read error response");
			console.error(`Brave News API error ${response.status}: ${errorText}`);
			return {
				success: false,
				error: getBraveApiErrorMessage("news", response.status, errorText),
			};
		}

		const data = (await response.json()) as any;

		// Validate response structure
		if (!data || typeof data !== "object") {
			console.error("❌ Invalid response structure: response is not an object");
			return { success: false, error: "Brave returned an unexpected response." };
		}

		if (!Array.isArray(data.results)) {
			console.error("❌ Invalid response structure: results is not an array");
			return { success: false, error: "Brave returned an unexpected response." };
		}

		console.log(`✅ Successfully fetched ${data.results?.length || 0} results from Brave News`);
		const results = data.results as BraveNewsSearchResult[];

		return results.map(({ title, url, description, age }) => ({
			title: title?.trim() || "No title",
			url: url || "",
			description: description?.trim() || "No description",
			age: age?.replace(/\s+/g, " ").trim() || "Unknown age",
		}));
	} catch (error) {
		console.error("❌ Error fetching news from Brave:", error);
		return { success: false, error: `Brave news search failed: ${String(error)}` };
	}
}

const BRAVE_WEB_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

/**
 * Search the web using the Brave Search API.
 *
 * This function allows retrieval of web search results on any topic. It provides
 * relevant information from various web sources.
 *
 * @param {BraveWebSearchParams} params - The parameters for the web search.
 * @param {string} params.q - The search query for web results. Be specific and use keywords relevant to the desired topic.
 * @param {number} [params.count=10] - The number of web results to return. Default is 10.
 * @param {number} [params.offset=0] - The offset for pagination of results. Default is 0.
 * @param {('strict'|'moderate'|'off')} [params.safesearch='moderate'] - Safe search setting. "strict" for highest content filtering, "moderate" for balanced, "off" for unfiltered results. Default is 'moderate'.
 * @param {('day'|'week'|'month')} [params.freshness] - Filter results by recency. Use "day" for very recent content, "week" for recent content, "month" for content from the past month.
 * @returns {Promise<BraveWebSearchResult[]>} A promise that resolves to an array of web search results.
 */
export async function searchWeb({
	q,
	count = 10,
	offset = 0,
	safesearch = "moderate",
	freshness,
}: BraveWebSearchParams): Promise<BraveWebSearchResult[] | SearchProviderError> {
	console.log(`🔍 Searching Brave Web for: "${q}"`);
	try {
		const url = new URL(BRAVE_WEB_SEARCH_ENDPOINT);
		const params = {
			q,
			count,
			offset,
			safesearch,
			freshness: toBraveFreshness(freshness),
			country: "us",
			search_lang: "en",
			spellcheck: 1,
			extra_snippets: true,
		};

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				url.searchParams.append(key, value.toString());
			}
		}

		console.log(`🌐 Fetching from URL: ${url.toString()}`);
		const response = await fetchWithTimeout(url.toString(), {
			method: "GET",
			headers: {
				Accept: "application/json",
				"X-Subscription-Token": BRAVE_API_KEY || "",
			},
		});

		if (!response.ok) {
			console.error(`❌ HTTP error! status: ${response.status}`);
			const errorText = await response.text().catch(() => "Unable to read error response");
			console.error(`Brave Web API error ${response.status}: ${errorText}`);
			return {
				success: false,
				error: getBraveApiErrorMessage("web", response.status, errorText),
			};
		}

		const data = (await response.json()) as any;

		// Extract possible results arrays in priority order
		const possibleResults: any[] =
			(data?.web?.results as any[]) ||
			(data?.mixed?.main as any[]) ||
			(data?.mixed?.top as any[]) ||
			(data?.mixed?.side as any[]) ||
			[];

		if (possibleResults.length === 0) {
			console.log("ℹ️ Brave Web Search returned no result array (web/mixed)");
			return [];
		}

		console.log(`✅ Successfully fetched ${possibleResults.length} results from Brave Web Search`);

		return possibleResults.map(({ title, url, description, snippet, extra_snippets }: any) => {
			const snippets = Array.isArray(extra_snippets) ? extra_snippets : [];
			const combinedDescription = [description || snippet, ...snippets]
				.filter(Boolean)
				.map((value) => value.toString().trim())
				.join("\n");

			return {
				title: (title || snippet || "").toString().trim() || "No title",
				url: url || "",
				description: combinedDescription || "No description",
			};
		}) as BraveWebSearchResult[];
	} catch (error) {
		console.error("❌ Error fetching web results from Brave:", error);
		return { success: false, error: `Brave web search failed: ${String(error)}` };
	}
}

// Define the interface for Brave Image Search Result
export interface BraveImageSearchResult {
	title: string;
	url: string;
	source: string;
	thumbnail: {
		src: string;
	};
}

// Define the endpoint for Brave Image Search
const BRAVE_IMAGE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/images/search";

export async function searchImages({
	q,
	count = 5,
	safesearch = "off",
	freshness,
}: BraveWebSearchParams): Promise<BraveImageSearchResult[] | SearchProviderError> {
	console.log(`🖼️ Searching Brave Images for: "${q}"`);

	try {
		const url = new URL(BRAVE_IMAGE_SEARCH_ENDPOINT);
		const params = {
			q,
			count,
			safesearch,
			freshness: toBraveFreshness(freshness),
			country: "us",
			search_lang: "en",
			spellcheck: 1,
		};

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				url.searchParams.append(key, value.toString());
			}
		}

		console.log(`🌐 Fetching images from URL: ${url.toString()}`);
		const response = await fetchWithTimeout(url.toString(), {
			method: "GET",
			headers: {
				Accept: "application/json",
				"Accept-Encoding": "gzip",
				"X-Subscription-Token": BRAVE_API_KEY || "",
			},
		});

		if (!response.ok) {
			console.error(`❌ HTTP error! status: ${response.status}`);
			const errorText = await response.text().catch(() => "Unable to read error response");
			console.error(`Brave Images API error ${response.status}: ${errorText}`);
			return {
				success: false,
				error: getBraveApiErrorMessage("image", response.status, errorText),
			};
		}

		const data = (await response.json()) as any;

		// Validate response structure
		if (!data || typeof data !== "object") {
			console.error("❌ Invalid response structure: response is not an object");
			return { success: false, error: "Brave returned an unexpected response." };
		}

		if (!Array.isArray(data.results)) {
			console.error("❌ Invalid response structure: results is not an array");
			return { success: false, error: "Brave returned an unexpected response." };
		}

		console.log(
			`✅ Successfully fetched ${data.results?.length || 0} image results from Brave Image Search`,
		);

		const mappedResults = data.results.map(
			({ title, url, source, thumbnail }: BraveImageSearchResult) => ({
				title: title?.trim() || "No title",
				url: thumbnail?.src || url || "",
				source: source || "Unknown source",
				thumbnail: thumbnail || { src: url || "" },
			}),
		);
		// console.log("Mapped image search results:", mappedResults);
		return mappedResults;
	} catch (error) {
		console.error("❌ Error fetching image results from Brave:", error);
		return { success: false, error: `Brave image search failed: ${String(error)}` };
	}
}

function getBraveApiErrorMessage(
	searchType: "web" | "news" | "image",
	status: number,
	errorText: string,
) {
	if (status === 401 || errorText.includes("SUBSCRIPTION_TOKEN_INVALID")) {
		return `Brave ${searchType} search is unavailable because BRAVE_API_KEY is invalid.`;
	}

	return `Brave ${searchType} search failed with HTTP ${status}.`;
}
