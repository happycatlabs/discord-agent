# discord-agent

A Discord bot that takes part in conversations the way a person in the server would. It doesn't wait to be @mentioned: it reads the channel and decides for itself whether to reply, react with an emoji, or stay quiet.

## What it does

- **Decides when to speak.** Every message goes through a quick AI check that answers four questions: reply or not, react or not, reply to this specific message or just post in the channel, and whether to hold off a few seconds. Staying quiet is the default. It ignores side conversations, "lol" and "brb", and holds back in busy channels in case someone else answers first.
- **Remembers the channel.** It stores messages in SQLite and uses recent history, plus its own last message, as context.
- **Looks things up.** It can search the web and read pages through Brave, SerpAPI, Jina or Parallel, whichever have keys set.
- **Optional extras**, each behind a feature flag: XP and levels, an economy with betting and casino games, and a vector knowledge base.
- **Slash commands** for polls, avatars and banners, reaction roles, purging messages, and server setup.

## Requirements

- [Bun](https://bun.sh) 1.x
- A Discord application with a bot user. Enable the **Message Content**, **Server Members** and **Presence** intents.
- An OpenAI API key and an Anthropic API key.

## Setup

```bash
bun install
cp .env.example .env   # then fill in the Required section
```

Register slash commands, then start the bot:

```bash
bun dc        # register global commands for the production bot
bun start
```

### Development

Use a second Discord application for development so you don't disturb the live bot:

```bash
# .env: DEV_TOKEN, DEV_CLIENT_ID, and DEV_GUILD_IDS for your test server(s)
bun dc-dev    # register dev commands in DEV_GUILD_IDS
bun dev       # run with file watching
```

To remove registered commands: `bun clear-commands prod` or `bun clear-commands dev`.

### Checks

```bash
bun test
bun run typecheck
bun run check   # format + lint
```

## Running in production

`ecosystem.config.js` runs the bot under [PM2](https://pm2.keymetrics.io):

```bash
pm2 start ecosystem.config.js
```

Data lives in `data/agent.sqlite` (change it with `AGENT_SQLITE_PATH`). Set `SENTRY_DSN` to send errors to Sentry.

## Configuration

All configuration comes from environment variables. `.env.example` lists every one with its default.
