# Contributing

Thanks for helping. This is a small project, so the rules are short.

## Setup

1. Install [Bun](https://bun.com). The version CI uses is in `.bun-version`.
2. `bun install`
3. Copy `.env.example` to `.env` and fill in what you need. For a test bot, set `DEV_TOKEN` and `DEV_GUILD_IDS`.
4. `bun run dev`

`AGENTS.md` is the map of the codebase. Read the section for the area you're changing.

## Before you open a PR

Run everything CI runs:

```sh
bun run check   # format, type check, lint, tests
```

Or one at a time: `bun run format:check`, `bun run typecheck`, `bun run lint`, `bun test`. `bun run format` fixes formatting.

The pre-commit hook formats staged files and lints staged code.

## What CI checks

- **Format:** `bun fmt`, configured by `.oxfmtrc.json`.
- **Types:** `bun check` against `jsconfig.json`.
- **Lint:** oxlint with type-aware rules, plus the project rules in `lint/plugin.mjs`:
  - `local/no-user-content-in-logs`: don't log message content, prompts or search queries. Log IDs, counts or lengths.
  - `local/nullable-ai-schema-fields`: in AI output schemas use `.nullable()`, not `.optional()`. OpenAI's strict mode sends `null` for unused fields.
- **Tests:** `bun test`.

Pull requests also get an automated code review.

## Rules that matter most

- **Permissions live in code, not prompts.** Any AI tool that acts on a server goes through `src/lib/ai/tool-access.ts`. The model never chooses the server or acting user. New server tools are admin-only until listed in `TOOL_PERMISSIONS` or `MEMBER_SERVER_TOOLS`.
- **Keep data in its scope.** One server's or user's data must never reach another server or user.
- **Migrations are additive.** Add columns with `ensureColumn()`. No destructive migrations unless that is the task.
- **Don't log secrets or user content.**
- **Follow the docs.** For discord.js components and APIs, check the installed types in `node_modules/discord.js` and the official docs instead of guessing.

## Testing Discord behavior

Pure logic should have a unit test. Some things only show up in a real Discord server: permissions, components, reactions, threads. For those, say in the PR what you checked by hand and what you didn't.

## Commits and PRs

Keep PRs small and focused. Describe what changed and why, and how you verified it.
