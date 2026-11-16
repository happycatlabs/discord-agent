import { describe, expect, test } from "bun:test";
import { toReplyDecision } from "../openai";

describe("toReplyDecision", () => {
	test("reply defaults to a plain message", () => {
		expect(toReplyDecision({ action: "reply" })).toEqual({ action: "reply", quoteMessage: false });
		expect(toReplyDecision({ action: "reply", quoteMessage: true })).toEqual({
			action: "reply",
			quoteMessage: true,
		});
	});

	test("react needs an emoji, otherwise ignore", () => {
		expect(toReplyDecision({ action: "react", emoji: " 🔥 " })).toEqual({
			action: "react",
			emoji: "🔥",
		});
		expect(toReplyDecision({ action: "react" })).toEqual({ action: "ignore" });
		expect(toReplyDecision({ action: "react", emoji: "  " })).toEqual({ action: "ignore" });
	});

	test("stray fields don't leak into other actions", () => {
		expect(toReplyDecision({ action: "ignore", emoji: "🔥", quoteMessage: true })).toEqual({
			action: "ignore",
		});
	});

	test("missing output means ignore", () => {
		expect(toReplyDecision(undefined)).toEqual({ action: "ignore" });
	});
});
