// Feature flags for major systems. Defaults bias toward safety in dev.

const parseEnvFlag = (value: string | undefined, defaultValue: boolean): boolean => {
	if (value === undefined) return defaultValue;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return defaultValue;
};

export const FEATURE_LEVELING = parseEnvFlag(process.env.FEATURE_LEVELING, true);
export const FEATURE_BETTING = parseEnvFlag(process.env.FEATURE_BETTING, false);
// Casino is paused by default until we explicitly opt in.
export const FEATURE_CASINO = parseEnvFlag(process.env.FEATURE_CASINO, false);
export const FEATURE_VECTOR_KB = parseEnvFlag(process.env.FEATURE_VECTOR_KB, false);

export const DEBUG = false;

export const __test__ = { parseEnvFlag };
