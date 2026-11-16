import * as Sentry from "@sentry/node";

export type EventErrorContext = Record<string, unknown>;

export function normalizeEventError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error("Unknown event error");
	}
}

export function reportEventError(
	eventName: string,
	error: unknown,
	context: EventErrorContext = {},
	level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "error",
) {
	const normalized = normalizeEventError(error);
	Sentry.withScope((scope) => {
		scope.setTag("event.handler", eventName);
		scope.setLevel(level);
		if (Object.keys(context).length > 0) {
			scope.setContext("event_context", context);
		}
		Sentry.captureException(normalized);
	});

	const log = level === "warning" ? console.warn : console.error;
	log(`[events:${eventName}] ${normalized.message}`, {
		context,
		error,
	});
}
