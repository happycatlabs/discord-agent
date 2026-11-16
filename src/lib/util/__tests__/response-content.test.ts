import { describe, expect, test } from "bun:test";
import { sanitizeAgentResponse } from "../response-content";

describe("response content", () => {
	test("strips stale preview tags when no expand details exist", () => {
		expect(
			sanitizeAgentResponse(`<agent-preview>
Latest Lost Ark updates: raids, events, and class changes.
</agent-preview>`),
		).toBe("Latest Lost Ark updates: raids, events, and class changes.");
	});

	test("strips stale preview and expand tags without losing text", () => {
		expect(
			sanitizeAgentResponse(`<agent-preview>
Short version.
</agent-preview>
<agent-expand>
More details.
</agent-expand>`),
		).toBe("Short version.\n\nMore details.");
	});
});
