/**
 * Tool wrappers for Brave news and image search.
 *
 * Every search tool returns the same shape as SEARCH_WEB:
 * `{ success: true, results: SearchToolResult[] }` or `{ success: false, error }`.
 * The Brave helpers keep their raw shape because `/img` uses them directly.
 */
import {
	type BraveNewsSearchParams,
	type BraveWebSearchParams,
	searchBraveNews,
	searchImages,
} from "../brave";

export type SearchToolResult = {
	title: string;
	url: string;
	description?: string;
	source: string;
	sourceKind: "news" | "image";
	provider: "brave_news" | "brave_images";
	publishDate?: string;
};

export type SearchToolOutput =
	| { success: true; results: SearchToolResult[] }
	| { success: false; error: string };

const hostFromUrl = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
};

const isError = (raw: unknown): raw is { success: false; error: string } =>
	!Array.isArray(raw) && typeof raw === "object" && raw !== null && "error" in raw;

type RawNews = { title?: string; url?: string; description?: string; age?: string };
type RawImage = { title?: string; url?: string; source?: string };

export const toNewsOutput = (
	raw: RawNews[] | { success: false; error: string },
): SearchToolOutput => {
	if (isError(raw)) return { success: false, error: raw.error };
	return {
		success: true,
		results: raw
			.filter((item) => item.url)
			.map((item) => ({
				title: item.title || "No title",
				url: item.url as string,
				description: item.description,
				source: hostFromUrl(item.url as string),
				sourceKind: "news",
				provider: "brave_news",
				publishDate: item.age && item.age !== "Unknown age" ? item.age : undefined,
			})),
	};
};

export const toImageOutput = (
	raw: RawImage[] | { success: false; error: string },
): SearchToolOutput => {
	if (isError(raw)) return { success: false, error: raw.error };
	return {
		success: true,
		results: raw
			.filter((item) => item.url)
			.map((item) => ({
				title: item.title || "No title",
				url: item.url as string,
				source:
					item.source && item.source !== "Unknown source"
						? item.source
						: hostFromUrl(item.url as string),
				sourceKind: "image",
				provider: "brave_images",
			})),
	};
};

export const searchNewsTool = async (params: BraveNewsSearchParams) =>
	toNewsOutput(await searchBraveNews(params));

export const searchImagesTool = async (params: BraveWebSearchParams) =>
	toImageOutput(await searchImages(params));
