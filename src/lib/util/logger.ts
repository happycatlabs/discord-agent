import * as Sentry from "@sentry/node";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
	fatal: 50,
};

const SENTRY_LEVEL: Record<LogLevel, Sentry.SeverityLevel> = {
	debug: "debug",
	info: "info",
	warn: "warning",
	error: "error",
	fatal: "fatal",
};

const parseFlag = (value: string | undefined, defaultValue: boolean) => {
	if (value === undefined) return defaultValue;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return defaultValue;
};

const isDev = process.env.NODE_ENV === "development";
const devLogsEnabled = parseFlag(process.env.DEV_LOGS, isDev);
const consoleLogsEnabled = parseFlag(process.env.LOG_TO_CONSOLE, devLogsEnabled);
const sentryBreadcrumbsEnabled = parseFlag(process.env.LOG_SENTRY_BREADCRUMBS, true);
const minimumLevel =
	(process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ?? (isDev ? "debug" : "warn");
const allowedScopes = (process.env.LOG_SCOPES || "")
	.split(",")
	.map((scope) => scope.trim())
	.filter(Boolean);

const isScopeEnabled = (scope: string) =>
	allowedScopes.length === 0 ||
	allowedScopes.includes("*") ||
	allowedScopes.some((allowed) => scope === allowed || scope.startsWith(`${allowed}.`));

const shouldConsoleLog = (scope: string, level: LogLevel) =>
	consoleLogsEnabled && isScopeEnabled(scope) && LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minimumLevel];

const redact = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(redact);
	if (!value || typeof value !== "object") return value;

	return Object.fromEntries(
		Object.entries(value as LogContext).map(([key, nested]) => {
			if (
				/^(token|secret|password|authorization|cookie)$/i.test(key) ||
				/(api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|discord[_-]?token)/i.test(
					key,
				)
			) {
				return [key, "[redacted]"];
			}
			return [key, redact(nested)];
		}),
	);
};

const normalizeError = (error: unknown): Error => {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error("Unknown non-error");
	}
};

export class Logger {
	constructor(
		private readonly scope: string,
		private readonly baseContext: LogContext = {},
	) {}

	child(scope: string, context: LogContext = {}) {
		return new Logger(`${this.scope}.${scope}`, {
			...this.baseContext,
			...context,
		});
	}

	debug(message: string, context?: LogContext) {
		this.write("debug", message, context);
	}

	info(message: string, context?: LogContext) {
		this.write("info", message, context);
	}

	warn(message: string, context?: LogContext) {
		this.write("warn", message, context);
	}

	error(message: string, error?: unknown, context?: LogContext) {
		this.write("error", message, context, error);
	}

	fatal(message: string, error?: unknown, context?: LogContext) {
		this.write("fatal", message, context, error);
	}

	captureException(
		error: unknown,
		context: LogContext & {
			level?: LogLevel;
			message?: string;
		} = {},
	) {
		const level = context.level ?? "error";
		const { level: _level, message, ...extra } = context;
		this.write(level, message ?? normalizeError(error).message, extra, error, true);
	}

	async time<T>(operation: string, callback: () => Promise<T>, context?: LogContext): Promise<T> {
		const start = performance.now();
		this.debug(`${operation} started`, context);
		try {
			const result = await callback();
			this.debug(`${operation} completed`, {
				...context,
				durationMs: Math.round(performance.now() - start),
			});
			return result;
		} catch (error) {
			this.captureException(error, {
				...context,
				level: "error",
				message: `${operation} failed`,
				durationMs: Math.round(performance.now() - start),
			});
			throw error;
		}
	}

	private write(
		level: LogLevel,
		message: string,
		context?: LogContext,
		error?: unknown,
		forceCapture = false,
	) {
		const data = redact({
			...this.baseContext,
			...context,
		}) as LogContext;

		if (sentryBreadcrumbsEnabled) {
			Sentry.addBreadcrumb({
				category: this.scope,
				level: SENTRY_LEVEL[level],
				message,
				data,
			});
		}

		const shouldCapture = forceCapture || level === "error" || level === "fatal";
		if (shouldCapture && error !== undefined) {
			const normalized = normalizeError(error);
			Sentry.withScope((scope) => {
				scope.setTag("log.scope", this.scope);
				scope.setLevel(SENTRY_LEVEL[level]);
				if (Object.keys(data).length > 0) {
					scope.setContext("log.context", data);
				}
				Sentry.captureException(normalized);
			});
		}

		if (!shouldConsoleLog(this.scope, level)) return;

		const payload = Object.keys(data).length > 0 ? data : undefined;
		const line = `[${level.toUpperCase()}] [${this.scope}] ${message}`;
		if (level === "error" || level === "fatal") {
			console.error(line, payload ?? "", error ?? "");
		} else if (level === "warn") {
			console.warn(line, payload ?? "");
		} else {
			console.log(line, payload ?? "");
		}
	}
}

export const createLogger = (scope: string, context?: LogContext) => new Logger(scope, context);
