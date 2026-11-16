import { describe, expect, test } from "bun:test";
import {
	normalizeConfigKey,
	parseBooleanValue,
	parseConfigLines,
	parseIntegerValue,
} from "../config-utils";

describe("config utils", () => {
	test("normalizeConfigKey aliases xp_cooldown", () => {
		expect(normalizeConfigKey("xp_cooldown")).toBe("xp_cooldown_seconds");
	});

	test("parseBooleanValue reads common inputs", () => {
		expect(parseBooleanValue("true")).toBe(true);
		expect(parseBooleanValue("0")).toBe(false);
		expect(parseBooleanValue("maybe")).toBeNull();
	});

	test("parseIntegerValue handles numbers", () => {
		expect(parseIntegerValue("42")).toBe(42);
		expect(parseIntegerValue("")).toBe(null);
	});

	test("parseConfigLines parses updates and errors", () => {
		const { updates, errors } = parseConfigLines({
			input: "xp_min: 10\nenabled: true\nunknown: 1",
			allowedKeys: ["xp_min", "enabled"],
		});
		expect(updates).toEqual({ xp_min: 10, enabled: 1 });
		expect(errors.length).toBe(1);
	});
});
