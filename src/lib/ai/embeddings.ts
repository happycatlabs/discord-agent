import { FEATURE_VECTOR_KB } from "../constants/flags";
import { createLogger } from "../util/logger";

export const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
export const GEMINI_EMBEDDING_DIMENSIONS = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 768);

const GEMINI_EMBEDDING_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`;
const logger = createLogger("ai.embeddings", {
	model: GEMINI_EMBEDDING_MODEL,
	dimensions: GEMINI_EMBEDDING_DIMENSIONS,
});

type GeminiEmbeddingResponse = {
	embedding?: {
		values?: number[];
	};
	embeddings?: Array<{
		values?: number[];
	}>;
	error?: {
		message?: string;
	};
};

export type EmbeddingPurpose = "query" | "document";

const formatEmbeddingContent = ({
	text,
	title,
	purpose,
}: {
	text: string;
	title?: string;
	purpose: EmbeddingPurpose;
}) => {
	const compactText = text.trim();
	if (purpose === "query") return `task: question answering | query: ${compactText}`;

	if (title?.trim()) {
		return `title: ${title.trim()} | text: ${compactText}`;
	}

	return `text: ${compactText}`;
};

export const embedText = async ({
	text,
	title,
	purpose,
}: {
	text: string;
	title?: string;
	purpose: EmbeddingPurpose;
}) => {
	if (!FEATURE_VECTOR_KB) {
		throw new Error("Vector knowledge base is disabled.");
	}

	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error("GEMINI_API_KEY is required when FEATURE_VECTOR_KB is enabled.");
	}

	return logger.time(
		"embedContent",
		async () => {
			const response = await fetch(GEMINI_EMBEDDING_ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: JSON.stringify({
					model: `models/${GEMINI_EMBEDDING_MODEL}`,
					content: {
						parts: [{ text: formatEmbeddingContent({ text, title, purpose }) }],
					},
					outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
				}),
			});

			const json = (await response.json()) as GeminiEmbeddingResponse;
			if (!response.ok) {
				throw new Error(
					json.error?.message || `Gemini embedding request failed (${response.status})`,
				);
			}

			const values = json.embedding?.values ?? json.embeddings?.[0]?.values;
			if (!values || values.length !== GEMINI_EMBEDDING_DIMENSIONS) {
				throw new Error(
					`Gemini embedding returned ${values?.length ?? 0} dimensions, expected ${GEMINI_EMBEDDING_DIMENSIONS}.`,
				);
			}

			return new Float32Array(values);
		},
		{
			purpose,
			textLength: text.length,
			hasTitle: Boolean(title),
		},
	);
};
