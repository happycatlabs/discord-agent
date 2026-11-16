import { BraveImageSearchResult, searchImages as searchBraveImages } from "./ai/brave";
import { storeImageSearch } from "./db/guild";
import { SerpImageSearchResult, searchImagesSerp } from "./serp";

interface ImageSearchParams {
	q: string;
	num?: number;
	provider: "brave" | "serp";
	guildId: string;
	userId: string;
}

export interface UnifiedImageResult {
	title?: string;
	url: string;
	thumbnail: string;
	original: string;
	source_logo?: string;
}

export async function searchImages({
	q,
	num = 50,
	provider,
	guildId,
	userId,
}: ImageSearchParams): Promise<UnifiedImageResult[]> {
	try {
		if (provider === "serp") {
			const serpResults = await searchImagesSerp({ q, num });
			return serpResults
				.filter((result: SerpImageSearchResult) => {
					const extension = result.original.split(".").pop()?.toLowerCase();
					return ["jpg", "jpeg", "png"].includes(extension || "");
				})
				.map((result: SerpImageSearchResult) => ({
					title: result?.title || "",
					url: result.original,
					thumbnail: result.thumbnail,
					original: result.original,
					source_logo: result.source_logo,
				}));
		}
		if (provider === "brave") {
			const braveResults = await searchBraveImages({ q, count: num });
			if (!Array.isArray(braveResults)) {
				throw new Error(braveResults.error);
			}
			// console.log(braveResults, "braveResults");
			return braveResults.map((result: BraveImageSearchResult) => ({
				title: result.title,
				url: result.thumbnail.src,
				thumbnail: result.thumbnail.src,
				original: result.thumbnail.src,
			}));
		}
		throw new Error("Invalid provider");
	} catch (error) {
		console.error(
			`❌ Error fetching image results from ${String(provider).toUpperCase()} API:`,
			error,
		);
		throw error;
	} finally {
		await storeImageSearch({
			guildId,
			userId,
			query: q,
			count: num,
		});
	}
}
