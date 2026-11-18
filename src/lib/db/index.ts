import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as Sentry from "@sentry/bun";
import * as sqliteVec from "sqlite-vec";
import { DEBUG, FEATURE_VECTOR_KB } from "../constants/flags";
import { createLogger } from "../util/logger";

type Params = Record<string, unknown> | unknown[] | undefined;

const DEFAULT_FILENAME = "agent.sqlite";
const DEFAULT_DIRECTORY = join(process.cwd(), "data");
const logger = createLogger("db");

const databasePath = process.env.AGENT_SQLITE_PATH
	? process.env.AGENT_SQLITE_PATH
	: join(DEFAULT_DIRECTORY, DEFAULT_FILENAME);

const findDefaultCustomSQLitePath = () => {
	if (process.env.SQLITE_CUSTOM_LIBRARY_PATH) return process.env.SQLITE_CUSTOM_LIBRARY_PATH;
	if (process.platform !== "darwin") return undefined;

	const candidates = [
		"/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
		"/usr/local/opt/sqlite/lib/libsqlite3.dylib",
		"/opt/homebrew/opt/sqlite3/lib/libsqlite3.dylib",
		"/usr/local/opt/sqlite3/lib/libsqlite3.dylib",
	];

	return candidates.find((candidate) => existsSync(candidate));
};

const customSQLitePath = FEATURE_VECTOR_KB ? findDefaultCustomSQLitePath() : undefined;
if (customSQLitePath) {
	Database.setCustomSQLite(customSQLitePath);
}

// Create directory with error handling
try {
	if (!existsSync(dirname(databasePath))) {
		mkdirSync(dirname(databasePath), { recursive: true });
	}
} catch (error) {
	console.error("Failed to create database directory:", error);
	Sentry.captureException(error, {
		level: "fatal",
		tags: { origin: "db.init", phase: "createDirectory" },
		extra: { databasePath },
	});
	throw new Error("Failed to create database directory. Cannot proceed.");
}

// Initialize database with error handling
let sqlite: Database;
try {
	sqlite = new Database(databasePath, { create: true });
} catch (error) {
	console.error("Failed to initialize SQLite database:", error);
	Sentry.captureException(error, {
		level: "fatal",
		tags: { origin: "db.init", phase: "createDatabase" },
		extra: { databasePath },
	});
	throw new Error("Failed to initialize SQLite database. Cannot proceed.");
}

if (FEATURE_VECTOR_KB) {
	try {
		sqliteVec.load(sqlite);
		const version = sqlite.query("SELECT vec_version() AS vec_version").get() as
			| { vec_version: string }
			| undefined;
		logger.info("sqlite-vec loaded", {
			version: version?.vec_version ?? "unknown",
			customSQLitePath,
		});
	} catch (error) {
		logger.captureException(error, {
			level: "fatal",
			message: "Failed to load sqlite-vec while FEATURE_VECTOR_KB is enabled",
			databasePath,
			customSQLitePath,
		});
		Sentry.captureException(error, {
			level: "fatal",
			tags: { origin: "db.init", phase: "loadSqliteVec" },
			extra: {
				databasePath,
				customSQLitePath,
			},
		});
		throw new Error("FEATURE_VECTOR_KB is enabled but sqlite-vec could not be loaded.");
	}
}

// Set PRAGMA statements with error handling
try {
	sqlite.exec("PRAGMA journal_mode = WAL;");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	sqlite.exec("PRAGMA busy_timeout = 5000;");
} catch (error) {
	console.error("Failed to set SQLite PRAGMA statements:", error);
	Sentry.captureException(error, {
		level: "error",
		tags: { origin: "db.init", phase: "setPragma" },
	});
	// Non-fatal, continue
}

const migrations = [
	`CREATE TABLE IF NOT EXISTS servers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		banner TEXT,
		icon TEXT,
		owner TEXT,
		member_count INTEGER,
		joined_at TEXT,
		created_at TEXT,
		log_channel TEXT,
		initialized_at TEXT,
		updated_at TEXT,
		guild_json TEXT
	);`,
	`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		tag TEXT,
		username TEXT,
		display_name TEXT,
		global_name TEXT,
		discriminator TEXT,
		avatar TEXT,
		is_bot INTEGER DEFAULT 0,
		created_at TEXT,
		updated_at TEXT
	);`,
	`CREATE TABLE IF NOT EXISTS server_memberships (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		joined_at TEXT,
		PRIMARY KEY (server_id, user_id),
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS ignored_users (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, user_id),
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS ignored_channels (
		server_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, channel_id),
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS whitelisted_users (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, user_id),
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS log_destinations (
		server_id TEXT NOT NULL,
		category TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, category),
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		author_id TEXT NOT NULL,
		server_id TEXT NOT NULL,
		channel_id TEXT,
		content TEXT,
		attachments_json TEXT,
		created_at TEXT,
		updated_at TEXT,
		deleted INTEGER NOT NULL DEFAULT 0,
		deleted_at TEXT,
		edits_json TEXT NOT NULL DEFAULT '[]',
		raw_json TEXT,
		FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS agent_messages (
		server_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		message_id TEXT NOT NULL,
		author_id TEXT,
		content TEXT,
		payload_json TEXT NOT NULL,
		created_at TEXT NOT NULL,
		PRIMARY KEY (server_id, channel_id)
	);`,
	`CREATE TABLE IF NOT EXISTS activities (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id TEXT,
		type TEXT,
		name TEXT,
		created_at TEXT,
		payload_json TEXT NOT NULL
	);`,
	`CREATE TABLE IF NOT EXISTS invites (
		code TEXT PRIMARY KEY,
		channel_id TEXT,
		created_at TEXT,
		expires_at TEXT,
		guild_id TEXT,
		inviter TEXT,
		max_age INTEGER,
		max_uses INTEGER,
		target_user TEXT,
		uses INTEGER,
		deleted INTEGER NOT NULL DEFAULT 0,
		deleted_at TEXT
	);`,
	`CREATE TABLE IF NOT EXISTS image_searches (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		query TEXT NOT NULL,
		count INTEGER NOT NULL,
		guild_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`,
	`CREATE TABLE IF NOT EXISTS search_source_uses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		user_message_id TEXT NOT NULL,
		response_message_id TEXT NOT NULL,
		query TEXT NOT NULL,
		source_rank INTEGER NOT NULL,
		title TEXT,
		url TEXT NOT NULL,
		source TEXT,
			source_kind TEXT,
			provider TEXT,
			published_at TEXT,
			snippet TEXT,
			diagnostics_json TEXT,
			created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
	"CREATE INDEX IF NOT EXISTS idx_search_source_uses_lookup ON search_source_uses(server_id, channel_id, user_id, created_at);",
	"CREATE INDEX IF NOT EXISTS idx_search_source_uses_response ON search_source_uses(response_message_id);",
	`CREATE TABLE IF NOT EXISTS response_artifacts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		user_message_id TEXT NOT NULL,
		response_message_id TEXT NOT NULL DEFAULT '',
		concise_text TEXT NOT NULL,
		full_text TEXT NOT NULL,
		sources_json TEXT,
		tool_trace_json TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		expires_at TEXT
	);`,
	"CREATE INDEX IF NOT EXISTS idx_response_artifacts_lookup ON response_artifacts(response_message_id, user_id);",
	`CREATE TABLE IF NOT EXISTS knowledge_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		scope TEXT NOT NULL CHECK(scope IN ('user', 'server', 'global')),
		owner_user_id TEXT NOT NULL DEFAULT '',
		server_id TEXT NOT NULL DEFAULT '',
		created_by_user_id TEXT NOT NULL,
		title TEXT,
		source_type TEXT NOT NULL DEFAULT 'note',
		source_url TEXT,
		metadata_json TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT
	);`,
	"CREATE INDEX IF NOT EXISTS idx_knowledge_entries_scope ON knowledge_entries(scope, owner_user_id, server_id, created_at);",
	`CREATE TABLE IF NOT EXISTS knowledge_chunks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		entry_id INTEGER NOT NULL,
		chunk_index INTEGER NOT NULL,
		text TEXT NOT NULL,
		embedding_model TEXT NOT NULL,
		embedding_dimensions INTEGER NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
	);`,
	"CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entry ON knowledge_chunks(entry_id, chunk_index);",
	`CREATE TABLE IF NOT EXISTS reminders (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		message TEXT NOT NULL,
		"when" TEXT NOT NULL,
		deleted INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT
	);`,
	`CREATE TABLE IF NOT EXISTS reaction_role_messages (
		id TEXT PRIMARY KEY,
		server_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		name TEXT NOT NULL,
		mode TEXT NOT NULL DEFAULT 'normal',
		created_by TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
	);`,
	`CREATE TABLE IF NOT EXISTS reaction_role_mappings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		message_id TEXT NOT NULL,
		emoji TEXT NOT NULL,
		emoji_name TEXT,
		role_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (message_id) REFERENCES reaction_role_messages(id) ON DELETE CASCADE,
		UNIQUE(message_id, emoji),
		UNIQUE(message_id, role_id)
	);`,
	"CREATE INDEX IF NOT EXISTS idx_rrm_server ON reaction_role_messages(server_id);",
	"CREATE INDEX IF NOT EXISTS idx_rrmapping_message ON reaction_role_mappings(message_id);",

	// Economy & Betting System
	`CREATE TABLE IF NOT EXISTS user_economy (
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		xp INTEGER NOT NULL DEFAULT 0,
		level INTEGER NOT NULL DEFAULT 1,
		coins INTEGER NOT NULL DEFAULT 0,
		total_coins_earned INTEGER NOT NULL DEFAULT 0,
		last_xp_at TEXT,
		last_daily_at TEXT,
		daily_streak INTEGER NOT NULL DEFAULT 0,
		profile_private INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (server_id, user_id)
	);`,
	`CREATE TABLE IF NOT EXISTS voice_sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		joined_at TEXT NOT NULL,
		left_at TEXT,
		duration_seconds INTEGER,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`,
	"CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_week ON voice_sessions(server_id, user_id, joined_at);",
	`CREATE TABLE IF NOT EXISTS level_rewards (
		server_id TEXT NOT NULL,
		level INTEGER NOT NULL,
		role_id TEXT NOT NULL,
		PRIMARY KEY (server_id, level)
	);`,
	`CREATE TABLE IF NOT EXISTS economy_config (
		server_id TEXT PRIMARY KEY,
		enabled INTEGER NOT NULL DEFAULT 1,
		xp_min INTEGER NOT NULL DEFAULT 15,
		xp_max INTEGER NOT NULL DEFAULT 25,
		xp_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
		daily_coins_min INTEGER NOT NULL DEFAULT 100,
		daily_coins_max INTEGER NOT NULL DEFAULT 500,
		daily_xp_min INTEGER NOT NULL DEFAULT 50,
		daily_xp_max INTEGER NOT NULL DEFAULT 150,
		levelup_channel_id TEXT,
		leaderboard_channel_id TEXT,
		casino_channel_id TEXT,
		min_bet INTEGER NOT NULL DEFAULT 50,
		max_bet INTEGER NOT NULL DEFAULT 10000
	);`,
	`CREATE TABLE IF NOT EXISTS betting_lines (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id TEXT NOT NULL,
		target_user_id TEXT NOT NULL,
		metric TEXT NOT NULL,
		line_value REAL NOT NULL,
		week_start TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(server_id, target_user_id, metric, week_start)
	);`,
	`CREATE TABLE IF NOT EXISTS bets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id TEXT NOT NULL,
		line_id INTEGER NOT NULL REFERENCES betting_lines(id),
		bettor_user_id TEXT NOT NULL,
		direction TEXT NOT NULL,
		amount INTEGER NOT NULL,
		multiplier REAL NOT NULL,
		placed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		resolved INTEGER NOT NULL DEFAULT 0,
		won INTEGER,
		payout INTEGER
	);`,
	"CREATE INDEX IF NOT EXISTS idx_bets_line ON bets(line_id);",
	"CREATE INDEX IF NOT EXISTS idx_bets_bettor ON bets(server_id, bettor_user_id);",
	`CREATE TABLE IF NOT EXISTS betting_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id TEXT NOT NULL,
		week_start TEXT NOT NULL,
		target_user_id TEXT NOT NULL,
		metric TEXT NOT NULL,
		line_value REAL NOT NULL,
		actual_value REAL NOT NULL,
		winning_direction TEXT NOT NULL,
		total_wagered INTEGER NOT NULL,
		total_paid_out INTEGER NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`,
	`CREATE TABLE IF NOT EXISTS betting_resolution_runs (
		server_id TEXT NOT NULL,
		week_start TEXT NOT NULL,
		resolved_at TEXT NOT NULL,
		PRIMARY KEY (server_id, week_start)
	);`,
	`CREATE TABLE IF NOT EXISTS reaction_xp_awards (
		server_id TEXT NOT NULL,
		message_id TEXT NOT NULL,
		reactor_user_id TEXT NOT NULL,
		author_user_id TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (message_id, reactor_user_id)
	);`,
];

// Run migrations with error handling
for (let i = 0; i < migrations.length; i++) {
	try {
		sqlite.exec(migrations[i]);
	} catch (error) {
		console.error(`Failed to run migration ${i + 1}/${migrations.length}:`, error);
		Sentry.captureException(error, {
			level: "fatal",
			tags: { origin: "db.migrations", migrationIndex: i.toString() },
			extra: { migrationSql: migrations[i].substring(0, 100) },
		});
		throw new Error(`Database migration ${i + 1} failed. Cannot proceed.`);
	}
}

// Backfill columns that were added after initial deploys.
const ensureColumn = (table: string, column: string, type: string) => {
	const columns = sqlite.query(`PRAGMA table_info(${table})`).all() as {
		name: string;
	}[];
	if (!columns.some((c) => c.name === column)) {
		sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
	}
};

ensureColumn("economy_config", "leaderboard_channel_id", "TEXT");
ensureColumn("user_economy", "profile_private", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("search_source_uses", "snippet", "TEXT");

if (FEATURE_VECTOR_KB) {
	try {
		sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunk_vectors USING vec0(
			embedding float[768],
			scope text,
			owner_user_id text,
			server_id text
		);`);
		logger.info("vector table ready", {
			table: "knowledge_chunk_vectors",
			dimensions: 768,
		});
	} catch (error) {
		logger.captureException(error, {
			level: "fatal",
			message: "Failed to create sqlite-vec table while FEATURE_VECTOR_KB is enabled",
			table: "knowledge_chunk_vectors",
		});
		Sentry.captureException(error, {
			level: "fatal",
			tags: { origin: "db.migrations", phase: "createVectorTable" },
		});
		throw new Error("FEATURE_VECTOR_KB is enabled but vector table could not be created.");
	}
}

let initialized = false;

export const connect = () => {
	if (initialized) return;
	initialized = true;
	if (DEBUG) {
		console.log(`Connected to SQLite database at ${databasePath}`);
	}
};

const prepare = (sql: string) => sqlite.query(sql);

export const run = (sql: string, params?: Params) => {
	return prepare(sql).run(params as any);
};

export const get = <T>(sql: string, params?: Params) => {
	return prepare(sql).get(params as any) as T | undefined;
};

export const all = <T>(sql: string, params?: Params) => {
	return prepare(sql).all(params as any) as T[];
};

export const transaction = <T>(callback: () => T) => {
	return sqlite.transaction(callback)();
};

export const database = sqlite;

export const normalizeId = (value: string) => {
	if (!value) return value;
	return value.includes(":") ? value.split(":")[1] : value;
};

export const withPrefix = (value: string, type: string) => {
	if (!value) return value;
	return value.includes(":") ? value : `${type}:${value}`;
};
