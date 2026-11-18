import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
// The repo config ignores lint/fixtures, so lint the fixture with only the local rules.
const tmp = mkdtempSync(join(tmpdir(), "lint-plugin-"));
const config = join(tmp, "oxlintrc.json");
writeFileSync(
	config,
	JSON.stringify({
		jsPlugins: [join(root, "lint/plugin.mjs")],
		rules: {
			"local/no-user-content-in-logs": "error",
			"local/nullable-ai-schema-fields": "error",
		},
	}),
);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const proc = Bun.spawnSync(
	["bunx", "oxlint", "-f", "json", "-c", config, "lint/fixtures/violations.ts"],
	{ cwd: root },
);
type Diagnostic = { code: string; labels: { span: { line: number } }[] };
const { diagnostics } = JSON.parse(proc.stdout.toString()) as { diagnostics: Diagnostic[] };
const linesFor = (rule: string) =>
	diagnostics
		.filter((d) => d.code === `local(${rule})`)
		.map((d) => d.labels[0]?.span.line)
		.sort((a, b) => (a ?? 0) - (b ?? 0));

describe("local lint rules", () => {
	test("nullable-ai-schema-fields flags .optional() in AI schemas", () => {
		expect(linesFor("nullable-ai-schema-fields")).toEqual([6]);
	});

	test("no-user-content-in-logs flags content and queries, not lengths", () => {
		expect(linesFor("no-user-content-in-logs")).toEqual([11, 13]);
	});
});
