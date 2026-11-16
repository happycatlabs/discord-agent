const PREVIEW_OPEN = "<agent-preview>";
const PREVIEW_CLOSE = "</agent-preview>";
const EXPAND_OPEN = "<agent-expand>";
const EXPAND_CLOSE = "</agent-expand>";

const previewPattern = new RegExp(`${PREVIEW_OPEN}\\s*([\\s\\S]*?)\\s*${PREVIEW_CLOSE}`, "i");
const expandPattern = new RegExp(`${EXPAND_OPEN}\\s*([\\s\\S]*?)\\s*${EXPAND_CLOSE}`, "i");
const internalTagPattern = new RegExp(
	`${PREVIEW_OPEN}|${PREVIEW_CLOSE}|${EXPAND_OPEN}|${EXPAND_CLOSE}`,
	"gi",
);

export const sanitizeAgentResponse = (content: string) => {
	const trimmed = content.trim();
	const preview = previewPattern.exec(trimmed)?.[1]?.trim();
	const expand = expandPattern.exec(trimmed)?.[1]?.trim();

	if (preview && expand) return `${preview}\n\n${expand}`.trim();
	if (preview) return preview;
	if (expand) return expand;

	return trimmed.replace(internalTagPattern, "").trim();
};
