import { describe, expect, test } from "bun:test";
import { PermissionFlagsBits as P } from "discord.js";
import { bindToolCall, MEMBER_SERVER_TOOLS, TOOL_PERMISSIONS } from "../tool-access";

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
		if (!result.ok) expect(result.denial.code).toBe("not_permitted");
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

	test("a member with the matching Discord permission can use the tool", () => {
		const mod = { ...member, permissions: P.ManageChannels | P.SendMessages };
		expect(bindToolCall("DELETE_CHANNEL", ["serverId", "channelId"], {}, mod).ok).toBe(true);
	});

	test("a matching permission doesn't unlock other tools", () => {
		const mod = { ...member, permissions: P.ManageChannels };
		const result = bindToolCall("CREATE_REACTION_ROLE_MESSAGE", ["serverId"], {}, mod);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.denial.error).toContain("Manage Roles");
	});

	test("tools that need two permissions need both", () => {
		const half = { ...member, permissions: P.ManageChannels };
		const both = { ...member, permissions: P.ManageChannels | P.ManageRoles };
		expect(bindToolCall("SET_CHANNEL_PERMISSIONS", ["serverId"], {}, half).ok).toBe(false);
		expect(bindToolCall("SET_CHANNEL_PERMISSIONS", ["serverId"], {}, both).ok).toBe(true);
	});

	test("Discord Administrator unlocks everything, including unlisted tools", () => {
		const owner = { ...member, permissions: P.Administrator };
		expect(bindToolCall("SOME_NEW_TOOL", ["serverId"], {}, owner).ok).toBe(true);
	});

	test("permissions never unlock server tools in DMs", () => {
		const result = bindToolCall(
			"DELETE_CHANNEL",
			["serverId"],
			{},
			{ ...dm, permissions: P.Administrator },
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.denial.code).toBe("server_only");
	});

	test("no tool is both member-level and permission-gated", () => {
		for (const name of Object.keys(TOOL_PERMISSIONS))
			expect(MEMBER_SERVER_TOOLS.has(name)).toBe(false);
	});

	test("overwrites at channel creation also need Manage Roles", () => {
		const mod = { ...member, permissions: P.ManageChannels };
		const plain = bindToolCall("CREATE_TEXT_CHANNEL", ["serverId"], { name: "x" }, mod);
		const locked = bindToolCall(
			"CREATE_TEXT_CHANNEL",
			["serverId"],
			{ name: "x", permissionOverwrites: '[{"id":"everyone","deny":"ViewChannel"}]' },
			mod,
		);
		expect(plain.ok).toBe(true);
		expect(locked.ok).toBe(false);
		if (!locked.ok) expect(locked.denial.error).toContain("Manage Roles");
		const both = { ...member, permissions: P.ManageChannels | P.ManageRoles };
		expect(
			bindToolCall("CREATE_TEXT_CHANNEL", ["serverId"], { permissionOverwrites: "[{}]" }, both).ok,
		).toBe(true);
	});

	test("an empty overwrite list doesn't need Manage Roles", () => {
		const mod = { ...member, permissions: P.ManageChannels };
		expect(
			bindToolCall("CREATE_CATEGORY", ["serverId"], { permissionOverwrites: "[]" }, mod).ok,
		).toBe(true);
	});

	test("private threads need Create Private Threads", () => {
		const mod = { ...member, permissions: P.CreatePublicThreads };
		expect(bindToolCall("CREATE_THREAD", ["serverId"], { type: "public" }, mod).ok).toBe(true);
		expect(bindToolCall("CREATE_THREAD", ["serverId"], { type: "private" }, mod).ok).toBe(false);
		const privateOnly = { ...member, permissions: P.CreatePrivateThreads };
		expect(bindToolCall("CREATE_THREAD", ["serverId"], { type: "private" }, privateOnly).ok).toBe(
			true,
		);
		expect(bindToolCall("CREATE_THREAD", ["serverId"], { type: "public" }, privateOnly).ok).toBe(
			false,
		);
	});
});
