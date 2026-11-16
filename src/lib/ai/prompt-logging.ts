const CHARS_PER_TOKEN_ESTIMATE = 4;

export const estimateTokens = (value: string) => Math.ceil(value.length / CHARS_PER_TOKEN_ESTIMATE);

export const truncateForPrompt = (value: string | undefined, maxChars: number) => {
	if (!value) return "";
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars).trim()}\n\n[truncated ${value.length - maxChars} chars]`;
};

export const logAiPayloadStats = (
	label: string,
	parts: Record<string, string | undefined>,
	extra?: Record<string, unknown>,
) => {
	const sizes = Object.fromEntries(
		Object.entries(parts).map(([key, value]) => [
			key,
			{
				chars: value?.length ?? 0,
				estimatedTokens: estimateTokens(value ?? ""),
			},
		]),
	);
	const totalChars = Object.values(parts).reduce((sum, value) => sum + (value?.length ?? 0), 0);

	console.log("[ai-payload]", label, {
		totalChars,
		estimatedTokens: estimateTokens(Object.values(parts).join("\n")),
		...sizes,
		...extra,
	});
};

export const summarizeToolOutputForLog = (output: unknown) => {
	const serialized = JSON.stringify(output);
	return {
		chars: serialized.length,
		estimatedTokens: estimateTokens(serialized),
		success:
			typeof output === "object" && output !== null && "success" in output
				? (output as { success?: unknown }).success
				: undefined,
	};
};
