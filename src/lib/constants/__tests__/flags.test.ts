import { describe, expect, test } from "bun:test";
import { __test__ } from "../flags";

describe("feature flags", () => {
	test("parseEnvFlag honors explicit truthy values", () => {
		expect(__test__.parseEnvFlag("true", false)).toBe(true);
		expect(__test__.parseEnvFlag("1", false)).toBe(true);
		expect(__test__.parseEnvFlag("YES", false)).toBe(true);
	});

	test("parseEnvFlag honors explicit falsy values", () => {
		expect(__test__.parseEnvFlag("false", true)).toBe(false);
		expect(__test__.parseEnvFlag("0", true)).toBe(false);
		expect(__test__.parseEnvFlag("off", true)).toBe(false);
	});

	test("parseEnvFlag falls back to default", () => {
		expect(__test__.parseEnvFlag(undefined, true)).toBe(true);
		expect(__test__.parseEnvFlag("maybe", false)).toBe(false);
	});
});
