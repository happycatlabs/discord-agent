export type ChannelInputParse =
	| { action: "skip" }
	| { action: "clear" }
	| { action: "set"; channelId: string };

export const parseChannelInput = (rawInput: string): ChannelInputParse | null => {
	const trimmed = rawInput.trim();
	if (!trimmed) return { action: "skip" };

	const lowered = trimmed.toLowerCase();
	if (["none", "clear", "null"].includes(lowered)) {
		return { action: "clear" };
	}

	const match = trimmed.match(/^<#(\d+)>$/);
	if (match) return { action: "set", channelId: match[1] };

	if (/^\d+$/.test(trimmed)) {
		return { action: "set", channelId: trimmed };
	}

	return null;
};
