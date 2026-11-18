import { SERP_API_KEY } from "./constants";

const FETCH_TIMEOUT_MS = 15000; // 15 second timeout

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

export interface SerpImageSearchParams {
	q: string;
	num?: number;
	safe?: "off" | "active";
}

export interface SerpImageSearchResult {
	title: string;
	source_logo: string;
	position: number;
	thumbnail: string;
	related_content_id: string;
	serpapi_related_content_link: string;
	original: string;
	original_width: number;
	original_height: number;
	is_product: boolean;
}

export async function searchImagesSerp({
	q,
	num = 100,
	safe = "off",
}: SerpImageSearchParams): Promise<SerpImageSearchResult[]> {
	console.log(`🖼️ Searching SERP API for images (${q.length} chars)`);

	try {
		const url = new URL("https://serpapi.com/search");
		const params = {
			engine: "google_images",
			q,
			num: num.toString(),
			safe,
			ijn: Number.parseInt(String(Math.random() * 1)),
			api_key: SERP_API_KEY,
		};

		// biome-ignore lint/complexity/noForEach: <explanation>
		Object.entries(params).forEach(([key, value]) => {
			if (value !== undefined) {
				url.searchParams.append(key, value.toString());
			}
		});

		console.log(`🌐 Fetching images from URL: ${url.toString()}`);
		const response = await fetchWithTimeout(url.toString());

		if (!response.ok) {
			console.error(`❌ HTTP error! status: ${response.status}`);
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = (await response.json()) as {
			images_results: SerpImageSearchResult[];
		};
		console.log(
			`✅ Successfully fetched ${data.images_results.length} image results from SERP API`,
		);
		console.log(data.images_results[0], "data.images_results");
		return data.images_results;
	} catch (error) {
		console.error("❌ Error fetching image results from SERP API:", error);
		throw error;
	}
}
