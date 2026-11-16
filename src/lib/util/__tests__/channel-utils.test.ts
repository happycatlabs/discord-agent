import { describe, expect, test } from "bun:test";
import { parseChannelInput } from "../channel-utils";

describe("channel utils", () => {
	test("parseChannelInput skips empty", () => {
		expect(parseChannelInput(" ")).toEqual({ action: "skip" });
	});

	test("parseChannelInput clears on keywords", () => {
		expect(parseChannelInput("none")).toEqual({ action: "clear" });
		expect(parseChannelInput("CLEAR")).toEqual({ action: "clear" });
	});

	test("parseChannelInput accepts mentions and raw IDs", () => {
		expect(parseChannelInput("<#123>")).toEqual({
			action: "set",
			channelId: "123",
		});
		expect(parseChannelInput("456")).toEqual({
			action: "set",
			channelId: "456",
		});
	});

	test("parseChannelInput rejects invalid input", () => {
		expect(parseChannelInput("#general")).toBeNull();
	});
});
