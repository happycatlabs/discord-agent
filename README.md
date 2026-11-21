# discord-agent

A Discord bot that joins conversations like a regular member. @mention it or reply to one of its messages and it answers. For the next 20 minutes it keeps reading that channel and decides on its own whether to reply, react with an emoji, or stay quiet. It answers DMs too.

## What it does

- **Picks its moments.** While it's following a channel, a quick AI check reads each new message and decides to reply, react or ignore it. Ignoring is the default, so it skips side conversations and messages like "lol" or "brb".
- **Uses the conversation as context.** It saves messages in SQLite and reads the recent channel history, plus its own last message, before it answers.
- **Looks things up.** It searches the web and reads pages with Brave, Jina and Parallel, using whichever ones have an API key set.
- **Manages the server when allowed.** Ask it to create channels or threads, change channel permissions, or set up reaction roles. Server admins and whitelisted users can use all of these. Other members can use the ones their Discord permissions already cover, such as Manage Channels for creating channels.
- **Optional features**, each behind a flag: XP and levels (on by default), an economy with betting and casino games, and a vector knowledge base.
- **Slash commands** for avatars and banners, image search, reaction roles, purging messages, the knowledge base and server setup.

## Requirements

- [Bun](https://bun.com) 1.4.4 or newer. CI uses the version in `.bun-version`.
- A Discord application with a bot user and these privileged intents turned on: **Message Content**, **Server Members** and **Presence**.
- An OpenAI API key and an Anthropic API key. OpenAI decides when to reply; Anthropic writes the answers and runs the tools.

## Setup

```bash
bun install
cp .env.example .env   # fill in the Required section
bun dc                 # register the slash commands
bun start
```

### Development

Use a second Discord application for development so testing doesn't touch the live bot. Set `DEV_TOKEN`, `DEV_CLIENT_ID` and `DEV_GUILD_IDS` (your test servers) in `.env`, then:

```bash
bun dc-dev   # register commands in your test servers
bun dev      # run with file watching
```

To remove registered commands, run `bun clear-commands prod` or `bun clear-commands dev`.

Before opening a pull request, run `bun run check`. It runs the same formatting, type, lint and test checks as CI. [CONTRIBUTING.md](CONTRIBUTING.md) has the details.

## Running in production

The bot runs under [PM2](https://pm2.keymetrics.io). Start it once:

```bash
pm2 start ecosystem.config.js
```

After that, deploy new code by running this on the server, from the repo root:

```bash
scripts/deploy.sh
```

The script checks out `origin/master`, reinstalls dependencies, restarts the bot and waits 30 seconds to make sure it stays up. If any step fails, it rolls back to the previous commit. It also re-registers the slash commands when their definitions have changed. `scripts/deploy.sh --help` lists the options.

Data lives in `data/agent.sqlite`; set `AGENT_SQLITE_PATH` to move it. Set `SENTRY_DSN` to send errors to Sentry.

## Configuration

All settings are environment variables. `.env.example` lists each one with its default.
