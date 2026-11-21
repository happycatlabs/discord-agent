import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandsHash, needsRegistration, writeState } from "../command-state";

const dir = mkdtempSync(join(tmpdir(), "command-state-"));
const file = join(dir, "state.json");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("command-state", () => {
	const ping = [{ name: "ping", description: "Ping" }];

	test("the hash depends on the definitions and the app", () => {
		expect(commandsHash("app", ping)).toBe(
			commandsHash("app", [{ name: "ping", description: "Ping" }]),
		);
		expect(commandsHash("app", ping)).not.toBe(
			commandsHash("app", [{ name: "ping", description: "Pong" }]),
		);
		expect(commandsHash("app", ping)).not.toBe(commandsHash("other-app", ping));
	});

	test("registration is needed until the same hash is recorded", () => {
		const hash = commandsHash("app", ping);
		expect(needsRegistration(hash, file)).toBe(true);
		writeState(hash, file);
		expect(needsRegistration(hash, file)).toBe(false);
		expect(needsRegistration(commandsHash("app", []), file)).toBe(true);
	});

	test("an unreadable state file means register again", () => {
		writeFileSync(file, "not json");
		expect(needsRegistration(commandsHash("app", ping), file)).toBe(true);
	});
});
