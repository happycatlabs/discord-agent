/**
 * Runs scripts/deploy.sh against a throwaway repo and a fake pm2.
 * The fake pm2 "starts" the app by running entry.ts; if that exits non-zero the app is errored.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEPLOY_SCRIPT = join(import.meta.dir, "../deploy.sh");
const COMMAND_STATE = join(import.meta.dir, "../command-state.ts");
let root = "";
let work = ""; // the "server" checkout the script deploys
let dev = ""; // where new commits are made and pushed
let env: Record<string, string> = {};

const sh = (cmd: string[], cwd = work) => {
	const proc = Bun.spawnSync(cmd, { cwd, env, stderr: "pipe", stdout: "pipe" });
	return { code: proc.exitCode, out: proc.stdout.toString().trim(), err: proc.stderr.toString() };
};
const git = (...args: string[]) => {
	const result = sh(["git", ...args]);
	if (result.code !== 0) throw new Error(`git ${args.join(" ")}: ${result.err}`);
	return result.out;
};
const write = (file: string, content: string, dir = work) => {
	mkdirSync(join(dir, file, ".."), { recursive: true });
	writeFileSync(join(dir, file), content);
};
const gitIn = (dir: string, ...args: string[]) => {
	const result = sh(["git", ...args], dir);
	if (result.code !== 0) throw new Error(`git ${args.join(" ")}: ${result.err}`);
	return result.out;
};
/** Commit in the dev clone and push to origin, like a merged PR. */
const commit = (message: string, files: Record<string, string>) => {
	for (const [file, content] of Object.entries(files)) write(file, content, dev);
	gitIn(dev, "add", "-A");
	gitIn(dev, "commit", "-qm", message);
	gitIn(dev, "push", "-q", "origin", "HEAD:master");
	return gitIn(dev, "rev-parse", "HEAD");
};
const deploy = (...args: string[]) => {
	const result = sh(["bash", "scripts/deploy.sh", ...args]);
	const fields = Object.fromEntries(
		[
			...result.out
				.split("\n")
				.at(-1)!
				.matchAll(/(\w+)=("[^"]*"|\S+)/g),
		].map((m) => [m[1], m[2]!.replace(/^"|"$/g, "")]),
	);
	return { ...result, fields };
};
const head = () => git("rev-parse", "HEAD");
const short = (sha: string) => sha.slice(0, 7);

const FAKE_PM2 = `#!/usr/bin/env bash
state="$FAKE_PM2_DIR"
case "$1" in
jlist)
	printf '[{"name":"Test App","pm2_env":{"status":"%s","restart_time":%s,"pm_uptime":%s,"watch":%s}}]' \\
		"$(cat "$state/status")" "$(cat "$state/restarts")" "$(cat "$state/started")" "$(cat "$state/watch")" ;;
stop) echo stopped >"$state/status" ;;
start)
	if bun entry.ts >/dev/null 2>&1; then echo online >"$state/status"
	else echo errored >"$state/status"; fi
	echo $(( $(date +%s) * 1000 - 600000 )) >"$state/started" ;;
esac
`;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "deploy-test-"));
	work = join(root, "work");
	const bin = join(root, "bin");
	const pm2State = join(root, "pm2");
	mkdirSync(bin);
	mkdirSync(pm2State);
	writeFileSync(join(bin, "pm2"), FAKE_PM2);
	chmodSync(join(bin, "pm2"), 0o755);
	writeFileSync(join(pm2State, "status"), "online");
	writeFileSync(join(pm2State, "restarts"), "0");
	writeFileSync(join(pm2State, "watch"), "false");
	writeFileSync(join(pm2State, "started"), String(Date.now() - 600_000));
	env = {
		PATH: `${bin}:${process.env.PATH}`,
		HOME: process.env.HOME ?? root,
		TMPDIR: root,
		FAKE_PM2_DIR: pm2State,
		DEPLOY_HEALTH_SECONDS: "1",
		GIT_AUTHOR_NAME: "test",
		GIT_AUTHOR_EMAIL: "test@example.com",
		GIT_COMMITTER_NAME: "test",
		GIT_COMMITTER_EMAIL: "test@example.com",
	};

	sh(["git", "init", "-q", "--bare", "-b", "master", join(root, "origin.git")], root);
	sh(["git", "clone", "-q", join(root, "origin.git"), work], root);
	mkdirSync(join(work, "scripts"), { recursive: true });
	copyFileSync(DEPLOY_SCRIPT, join(work, "scripts/deploy.sh"));
	copyFileSync(COMMAND_STATE, join(work, "scripts/command-state.ts"));
	write(".gitignore", "node_modules/\ndata/\n");
	write("ecosystem.config.js", 'module.exports = { apps: [{ name: "Test App" }] };\n');
	write(
		"package.json",
		JSON.stringify({ name: "fixture", dependencies: { "local-dep": "file:./local-dep" } }),
	);
	write("local-dep/package.json", JSON.stringify({ name: "local-dep", main: "index.js" }));
	write("local-dep/index.js", "module.exports = 1;\n");
	write("entry.ts", "process.exit(0);\n");
	// Same contract as the real scripts/deploy-commands.ts, with commands.json as the definitions.
	write(
		"scripts/deploy-commands.ts",
		`import { commandsHash, needsRegistration, writeState } from "./command-state";
const commands = JSON.parse(await Bun.file("commands.json").text());
const hash = commandsHash("app", commands);
if (process.argv.includes("--if-changed") && !needsRegistration(hash)) {
	console.log("commands=unchanged");
	process.exit(0);
}
if (process.env.FAIL_REGISTER) process.exit(1);
writeState(hash);
console.log("commands=registered");
`,
	);
	write("commands.json", JSON.stringify([{ name: "ping" }]));
	sh(["bun", "install"]);
	git("checkout", "-q", "-b", "master");
	git("add", "-A");
	git("commit", "-qm", "initial");
	git("push", "-q", "-u", "origin", "master");
	dev = join(root, "dev");
	sh(["git", "clone", "-q", join(root, "origin.git"), dev], root);
});

afterAll(() => {
	if (root) rmSync(root, { recursive: true, force: true });
});

describe("scripts/deploy.sh", () => {
	test("dry run reports the target and changes nothing", () => {
		const before = head();
		const next = commit("feature", { "feature.txt": "1\n" });
		const result = deploy("--dry-run");
		expect(result.code).toBe(0);
		expect(result.fields).toMatchObject({
			result: "dry_run",
			from: short(before),
			to: short(next),
		});
		expect(head()).toBe(before);
	});

	test("deploys origin/master and reports it", () => {
		const target = gitIn(dev, "rev-parse", "HEAD");
		const result = deploy();
		expect(result.code).toBe(0);
		expect(result.fields).toMatchObject({
			result: "deployed",
			to: short(target),
			commands: "registered", // first deploy: nothing registered yet
			next: "none",
		});
		expect(head()).toBe(target);
	});

	test("an already-deployed commit is unchanged", () => {
		const result = deploy();
		expect(result.code).toBe(0);
		expect(result.fields).toMatchObject({ result: "unchanged", commands: "unchanged" });
	});

	test("--force redeploys the running commit", () => {
		const result = deploy("--force");
		expect(result.code).toBe(0);
		expect(result.fields).toMatchObject({
			result: "deployed",
			from: short(head()),
			to: short(head()),
		});
	});

	test("a version that crashes on start is rolled back", () => {
		const good = head();
		commit("crash on start", { "entry.ts": "process.exit(1);\n" });
		const result = deploy();
		expect(result.code).toBe(1);
		expect(result.fields).toMatchObject({
			result: "rolled_back",
			reason: "unhealthy",
			from: short(good),
		});
		expect(head()).toBe(good);
		commit("fix entry", { "entry.ts": "process.exit(0);\n" });
		expect(deploy().fields.result).toBe("deployed");
	});

	test("a dependency that fails to load is rolled back before starting", () => {
		const good = head();
		commit("break dep", { "local-dep/index.js": 'throw new Error("broken");\n' });
		const result = deploy();
		expect(result.code).toBe(1);
		expect(result.fields).toMatchObject({
			result: "rolled_back",
			reason: "dependencies_failed_to_load",
		});
		expect(head()).toBe(good);
		commit("fix dep", { "local-dep/index.js": "module.exports = 1;\n" });
		expect(deploy().fields.result).toBe("deployed");
	});

	test("refuses a dirty checkout without touching anything", () => {
		const before = head();
		write("entry.ts", "process.exit(0); // local edit\n");
		const result = deploy();
		expect(result.code).toBe(3);
		expect(result.fields).toMatchObject({ result: "refused", reason: "dirty_tree" });
		expect(head()).toBe(before);
		git("checkout", "--", "entry.ts");
	});

	test("refuses --ref without a value", () => {
		const result = deploy("--ref");
		expect(result.code).toBe(3);
		expect(result.fields.reason).toBe("missing_ref");
	});

	test("refuses while PM2 is watching files", () => {
		const watch = join(env.FAKE_PM2_DIR!, "watch");
		writeFileSync(watch, '["src"]');
		const result = deploy();
		writeFileSync(watch, "false");
		expect(result.code).toBe(3);
		expect(result.fields.reason).toBe("pm2_watch_enabled");
	});

	test("refuses an unknown ref", () => {
		const result = deploy("--ref", "does-not-exist");
		expect(result.code).toBe(3);
		expect(result.fields.reason).toBe("unknown_ref");
	});

	test("registers slash commands only when their definitions change", () => {
		commit("code change only", { "src/commands/ping.ts": "export const ping = 2;\n" });
		expect(deploy().fields).toMatchObject({ result: "deployed", commands: "unchanged" });

		commit("new command", {
			"commands.json": JSON.stringify([{ name: "ping" }, { name: "pong" }]),
		});
		expect(deploy().fields).toMatchObject({ result: "deployed", commands: "registered" });
	});

	test("a rejected registration exits 4, and the next run retries it", () => {
		commit("another command", { "commands.json": JSON.stringify([{ name: "ping" }]) });
		env.FAIL_REGISTER = "1";
		const failed = deploy();
		delete env.FAIL_REGISTER;
		expect(failed.code).toBe(4);
		expect(failed.fields).toMatchObject({ result: "deployed", commands: "failed" });

		const retried = deploy();
		expect(retried.code).toBe(0);
		expect(retried.fields).toMatchObject({ result: "unchanged", commands: "registered" });
	});
});
