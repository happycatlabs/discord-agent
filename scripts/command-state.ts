/**
 * Tracks which slash command definitions were last registered with Discord, so a deploy
 * only calls Discord when the definitions actually changed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_FILE = "data/registered-commands.json";

type State = { hash: string; registeredAt: string };

/** Hash of the exact body sent to Discord, plus the app it was sent to. */
export const commandsHash = (clientId: string, commands: unknown[]) =>
	createHash("sha256").update(clientId).update("\0").update(JSON.stringify(commands)).digest("hex");

export const readState = (file = STATE_FILE): State | undefined => {
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as State;
	} catch {
		return undefined;
	}
};

export const writeState = (hash: string, file = STATE_FILE) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify({ hash, registeredAt: new Date().toISOString() })}\n`);
};

export const needsRegistration = (hash: string, file = STATE_FILE) =>
	readState(file)?.hash !== hash;
