# AGENTS.md

A Discord bot built on Discord.js v14, Bun and SQLite. It joins conversations on its own: an AI check decides whether to reply, react or stay quiet. This file is the working map for coding agents and contributors.

If your checkout has `.agents/skills/agent-dev/SKILL.md`, read it too. It holds maintainer-only notes that aren't part of the public repo.

## Start here

1. Run `git status --short` before editing.
2. Find your area in the task map below and read those files first.
3. Search with `rg`. Don't load the whole repo unless the task needs it.
4. Make the smallest change that works, then run the checks.

Facts:

- Runtime is **Bun**, not Node.
- Database is SQLite via `bun:sqlite`, default `data/agent.sqlite`. `AGENT_SQLITE_PATH` overrides it.
- All configuration is environment variables. See `.env.example`.
- AI shape: a router agent hands work to domain sub-agents, and the domain functions do the actual work.

## Commands

```sh
bun install
bun run dev              # dev bot (NODE_ENV=development, DEV_TOKEN), file watching
bun run start            # production bot (TOKEN)
bun run dc-dev           # register dev commands in DEV_GUILD_IDS
bun run dc               # register global commands for the production bot
bun run clear-commands   # bun clear-commands <prod|dev>
```

Checks to run before calling work done:

```sh
bun run format:check
bun run typecheck
bun run lint
bun test
```

For a narrow change, run the focused tests first, then the full set.

## Runtime path

`src/index.ts` → `src/events/index.ts` → `src/events/message/messageCreate.ts` or `src/events/interaction/interactionCreate.ts` → `src/lib/util/openai.ts` → `src/lib/ai/agents/router.ts` → `src/lib/ai/agents/sub-agents/*` → `src/lib/ai/functions/*` → `src/lib/db/*`

## Task map

| Task                                    | Read first                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup, intents, event registration    | `src/index.ts`, `src/events/index.ts`                                                                                                                        |
| When the bot replies (DMs and servers)  | `src/events/message/messageCreate.ts`, `src/lib/util/openai.ts`, `src/lib/ai/agents/router.ts`                                                               |
| Buttons, embeds, ephemeral replies      | `src/events/interaction/interactionCreate.ts`                                                                                                                |
| Slash commands                          | `src/commands/index.ts`, the command file, `src/lib/types/commands.ts`, `scripts/deploy-commands*.ts`                                                        |
| Add or change an AI-callable tool       | `src/lib/ai/functions/index.ts`, the domain file in `src/lib/ai/functions/`, its sub-agent in `src/lib/ai/agents/sub-agents/`, `src/lib/ai/agents/router.ts` |
| Web search, news, images, reading pages | `src/lib/ai/acquisition.ts`, `src/lib/ai/brave.ts`, `src/lib/ai/agents/sub-agents/search.ts`, `src/lib/db/search-sources.ts`                                 |
| Stored knowledge / vector search        | `src/lib/constants/flags.ts`, `src/lib/ai/embeddings.ts`, `src/lib/db/knowledge.ts`, `src/lib/ai/functions/knowledge.ts`                                     |
| Database schema or persistence          | `src/lib/db/index.ts`, the helper under `src/lib/db/`, related tests                                                                                         |
| Logging, prompt size, Sentry            | `src/lib/util/logger.ts`, `src/lib/ai/prompt-logging.ts`, `src/events/util.ts`, `src/index.ts`                                                               |
| Feature flags                           | `src/lib/constants/flags.ts`                                                                                                                                 |

## Message flow

`messageCreate.ts` decides how the bot responds.

- It ignores bot authors. DMs (`!message.guild`) go through `handleDirectMessage()`.
- **DMs:** fetch up to 25 recent messages, include attachment URLs, show typing and a status embed, call `chatFromDiscord()`, send the response, then save the sources it used.
- **Servers:** load server data and check access (Administrator or the server whitelist in the database). Direct @mentions and replies continuing a thread with the bot get an immediate answer. Everything else goes through `checkIfShouldReply()` in `src/lib/util/openai.ts`, which decides `shouldReply`, `shouldReact`, `directReply` and `shouldWait`.
- Replies the AI approves on its own can be debounced per channel (`channelTimeouts`, `IDLE_DELAY`). A new message in the channel cancels the pending reply.
- The bot's own ID is `AGENT_USER_ID`, which defaults to `CLIENT_ID`. At startup it logs an error if they don't match.

DM ID convention: AI context uses `serverId: ""` for DMs, while response artifacts and search-source storage use `serverId: "dm"`. Keep both unless you migrate every caller.

Response UX:

- `startTypingUntilDone()` repeats the typing indicator every 7 seconds until generation finishes.
- `createStatusReporter()` posts and edits one status embed per channel and deletes old progress messages.
- `sendDiscordContent()` splits long messages near Discord's limits. Components attach only to the first chunk.
- AI responses don't get "Expand" buttons. The agent picks a sensible length and users ask follow-ups. The old `agent_expand:*` handler stays only for old messages.

## Discord.js UI rule

Don't guess component APIs. Before adding or changing buttons, select menus, modals, embeds, ephemeral replies, Components V2 or collectors, check the installed source and types in `node_modules/discord.js` and `node_modules/@discordjs`. Use the Discord.js docs when those don't answer it.

Current patterns:

- Classic buttons: `ButtonBuilder` inside `ActionRowBuilder<ButtonBuilder>`.
- Components V2: see `src/lib/economy/xp.ts` (`ContainerBuilder`, `MessageFlags.IsComponentsV2`).
- Global button custom IDs use stable prefixes.
- Ephemeral replies use `flags: [MessageFlags.Ephemeral]`.
- Global buttons belong in `interactionCreate.ts`. Collectors local to one command stay in that command's file.

## AI tool architecture

The router only has delegation tools. Domain work belongs in sub-agents and functions.

- `src/lib/util/openai.ts` connects Discord to the AI. It answers source follow-up questions before routing and builds `DelegationContext`.
- `src/lib/ai/agents/router.ts` routes to sub-agents and applies the DM prompt rules.
- `src/lib/ai/agents/sub-agents/base.ts` turns function definitions into AI SDK tools and runs sub-agents.
- `src/lib/ai/functions/index.ts` is the central function registry.

To add an AI-callable capability:

1. Add database or service helpers if needed.
2. Add the function spec and implementation in `src/lib/ai/functions/<domain>.ts`.
3. Export them from `src/lib/ai/functions/index.ts`.
4. Add or update the sub-agent in `src/lib/ai/agents/sub-agents/<domain>.ts`.
5. Update `router.ts`: the lazy executor, `DelegationFunction`, the delegation tool, and the routing rules in the prompt.
6. Enforce permissions in the function code, not only in prompts.
7. Add focused tests for pure helpers, plus a smoke path for the tool when practical.

AI SDK gotchas:

- `tool()` takes `inputSchema`, not `parameters`.
- `createToolsFromFunctions()` converts only simple string, number and string-enum parameters cleanly.
- `executeSubAgent()` uses `stopWhen: stepCountIs(config.maxToolCalls)` so tool use continues past the first call.
- Use `src/lib/ai/prompt-logging.ts` for prompt-size diagnostics instead of logging raw prompts.
- Clean up stale internal response tags with `src/lib/util/response-content.ts`. Don't add new hidden tag formats.

## Search and sources

- `SEARCH_WEB` uses `searchWebAcquisition()` in `src/lib/ai/acquisition.ts`. It combines Brave, Parallel, Jina search and the Jina reader, sorts sources by kind, caches results briefly, and records diagnostics. Each provider is used only if its key is set.
- `SEARCH_BRAVE_NEWS` and `SEARCH_IMAGES` use the helpers in `src/lib/ai/brave.ts`.
- `sub-agents/base.ts` records the sources these tools return. `messageCreate.ts` saves them with the response, and `chatFromDiscord()` answers later "what's your source?" questions from the saved sources instead of searching again.
- Don't include source links unless the user asks for them.

## Authorization and scope

Don't rely on prompts for permissions.

- In servers, chat access requires Administrator or the server whitelist in the database. This becomes `user.isAdmin` in `DelegationContext`. DMs are always `isAdmin: false`.
- Tools that only make sense in a server must reject DMs (`context.serverId` is empty) in code.
- Owner-only commands such as `/dc` check `ADMIN_USER_IDS`.

Knowledge scopes:

- `user`: private to one Discord user. Default for DMs, personal preferences and user memory.
- `server`: visible only inside that server. Writing or deleting needs admin or whitelist access.
- `global`: visible everywhere. Writing or deleting needs elevated access.

Apply the scope filter before returning search results. Never show one user's knowledge to another user, or one server's to another server.

The knowledge agent supports `SEARCH_KNOWLEDGE`, `SAVE_KNOWLEDGE`, `LIST_KNOWLEDGE` and `DELETE_KNOWLEDGE`. Save stable, useful facts and preferences as user-scoped by default. Don't save secrets, sensitive personal details or one-off chat unless the user asks.

## Vector knowledge base

- Turned on by `FEATURE_VECTOR_KB=1`, which requires `GEMINI_API_KEY`. The model and dimensions default to `gemini-embedding-2` and `768`.
- Uses `sqlite-vec`. If the extension can't load or the vector table can't be created, startup fails rather than falling back. There is no JavaScript similarity fallback.
- Metadata is stored in normal tables and vectors in `knowledge_chunk_vectors` (`embedding float[768]`). Changing dimensions needs a schema change, not just an env change.
- On macOS, Bun may need Homebrew SQLite to load extensions. Point `SQLITE_CUSTOM_LIBRARY_PATH` at it. Linux loads the bundled extension directly.

## Database rules

- Add migrations to the `migrations` array in `src/lib/db/index.ts`. Backfill new columns with `ensureColumn()`.
- Helpers: `run`, `get`, `all`, `transaction`.
- Use `normalizeId()` wherever a Discord ID might carry a `type:` prefix.
- Point `AGENT_SQLITE_PATH` at a temporary file for smoke tests. Back up `data/agent.sqlite` before destructive local tests.
- Don't add destructive migrations unless data migration is the actual task.

## Logging

- Use `createLogger(scope)` for new diagnostic logs, not new `console.log` calls.
- Controls: `DEV_LOGS`, `LOG_TO_CONSOLE`, `LOG_LEVEL`, `LOG_SCOPES`, `LOG_SENTRY_BREADCRUMBS`.
- Never log raw user content, full prompts, embeddings, API keys, Discord tokens, cookies or authorization headers. Log IDs, counts, scopes, durations, model names and sizes instead.
- `logger.captureException()` sends caught errors to Sentry. `logger.time()` measures async work.
- Sentry starts in `src/index.ts` when `SENTRY_DSN` is set.

## Commands

- Slash commands are grouped under `src/commands/`, and the registry is `src/commands/index.ts`.
- Economy, casino and betting commands are behind feature flags.
- After adding or renaming a command, re-register it with `bun dc-dev` (dev) or `bun dc` (production).
