import { describe, expect, test } from "bun:test";
import { bindToolCall } from "../tool-access";

const member = { serverId: "server-a", userId: "user-1", isAdmin: false };
const admin = { ...member, isAdmin: true };
const dm = { serverId: "", userId: "user-1", isAdmin: false };

describe("bindToolCall", () => {
	test("replaces a model-supplied serverId with the current server", () => {
		const result = bindToolCall(
			"DELETE_CHANNEL",
			["serverId", "channelId"],
			{ serverId: "server-b", channelId: "c1" },
			admin,
		);
		expect(result).toEqual({ ok: true, args: { serverId: "server-a", channelId: "c1" } });
	});

	test("rejects server management for non-admins", () => {
		const result = bindToolCall("SET_CHANNEL_PERMISSIONS", ["serverId", "channelId"], {}, member);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.denial.code).toBe("admin_only");
	});

	test("unknown server tools default to admin-only", () => {
		const result = bindToolCall("SOME_NEW_TOOL", ["serverId"], {}, member);
		expect(result.ok).toBe(false);
	});

	test("lets members use read-only lookups", () => {
		const result = bindToolCall("GET_USER_RANK", ["serverId", "userId"], { userId: "u2" }, member);
		expect(result).toEqual({ ok: true, args: { serverId: "server-a", userId: "u2" } });
	});

	test("rejects server tools in DMs, even with a serverId argument", () => {
		const result = bindToolCall("GET_USER_RANK", ["serverId"], { serverId: "server-a" }, dm);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.denial.code).toBe("server_only");
	});

	test("binds createdBy to the requesting user", () => {
		const result = bindToolCall(
			"CREATE_REACTION_ROLE_MESSAGE",
			["serverId", "createdBy"],
			{ createdBy: "someone-else" },
			admin,
		);
		expect(result).toEqual({ ok: true, args: { serverId: "server-a", createdBy: "user-1" } });
	});

	test("tools without server params pass through", () => {
		expect(bindToolCall("SEARCH_WEB", ["q"], { q: "x" }, dm)).toEqual({
			ok: true,
			args: { q: "x" },
		});
	});
});
