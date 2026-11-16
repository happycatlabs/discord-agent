export const normalizeConfigKey = (rawKey: string): string => {
	const key = rawKey.trim().toLowerCase();
	if (key === "xp_cooldown") return "xp_cooldown_seconds";
	return key;
};

export const parseBooleanValue = (rawValue: string): boolean | null => {
	const normalized = rawValue.trim().toLowerCase();
	if (["true", "1", "yes", "on"].includes(normalized)) return true;
	if (["false", "0", "no", "off"].includes(normalized)) return false;
	return null;
};

export const parseIntegerValue = (rawValue: string): number | null => {
	if (!rawValue.trim()) return null;
	const parsed = Number.parseInt(rawValue.trim(), 10);
	return Number.isFinite(parsed) ? parsed : null;
};

export const parseConfigLines = ({
	input,
	allowedKeys,
}: {
	input: string;
	allowedKeys: string[];
}): { updates: Record<string, number>; errors: string[] } => {
	const updates: Record<string, number> = {};
	const errors: string[] = [];
	const allowed = new Set(allowedKeys.map((key) => normalizeConfigKey(key)));

	const lines = input
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const separatorIndex = line.indexOf(":");
		const altSeparatorIndex = line.indexOf("=");
		const index = separatorIndex === -1 ? altSeparatorIndex : separatorIndex;
		if (index === -1) {
			errors.push(`Invalid line (missing ':' or '='): ${line}`);
			continue;
		}

		const rawKey = line.slice(0, index).trim();
		const rawValue = line.slice(index + 1).trim();
		const key = normalizeConfigKey(rawKey);

		if (!allowed.has(key)) {
			errors.push(`Unknown setting: ${rawKey}`);
			continue;
		}

		if (key === "enabled") {
			const parsed = parseBooleanValue(rawValue);
			if (parsed === null) {
				errors.push(`Enabled must be true/false: ${rawValue}`);
				continue;
			}
			updates[key] = parsed ? 1 : 0;
			continue;
		}

		const parsed = parseIntegerValue(rawValue);
		if (parsed === null) {
			errors.push(`Invalid value for ${rawKey}: ${rawValue}`);
			continue;
		}

		updates[key] = parsed;
	}

	return { updates, errors };
};
