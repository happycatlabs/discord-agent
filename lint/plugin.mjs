/**
 * Project lint rules for mistakes this codebase has actually made.
 * Loaded by oxlint through `jsPlugins` in .oxlintrc.json (ESLint-compatible API).
 */

const LOGGERS = new Set(["console", "logger", "log"]);
const LOG_METHODS = new Set(["log", "info", "warn", "error", "debug", "trace"]);
// Values that hold what a user typed, or text derived from it.
const USER_CONTENT_PROPERTIES = new Set(["content", "cleanContent"]);
const USER_CONTENT_NAMES = new Set([
	"q",
	"query",
	"prompt",
	"usersMessage",
	"userMessageContent",
	"originalMessage",
]);

const isLogCall = (node) => {
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		LOGGERS.has(callee.object.name) &&
		callee.property.type === "Identifier" &&
		LOG_METHODS.has(callee.property.name)
	);
};

/** Find the first user-content reference inside an expression, skipping `.length`. */
const findUserContent = (node) => {
	if (!node || typeof node !== "object") return null;
	if (node.type === "MemberExpression") {
		if (node.property.type === "Identifier" && node.property.name === "length") return null;
		if (node.property.type === "Identifier" && USER_CONTENT_PROPERTIES.has(node.property.name)) {
			return `.${node.property.name}`;
		}
		return findUserContent(node.object);
	}
	if (node.type === "Identifier") return USER_CONTENT_NAMES.has(node.name) ? node.name : null;
	for (const key of ["expressions", "arguments", "elements"]) {
		if (Array.isArray(node[key])) {
			for (const child of node[key]) {
				const found = findUserContent(child);
				if (found) return found;
			}
		}
	}
	for (const key of [
		"left",
		"right",
		"test",
		"consequent",
		"alternate",
		"argument",
		"expression",
	]) {
		const found = findUserContent(node[key]);
		if (found) return found;
	}
	if (node.type === "ObjectExpression") {
		for (const prop of node.properties) {
			const found = findUserContent(prop.value ?? prop.argument);
			if (found) return found;
		}
	}
	return null;
};

const noUserContentInLogs = {
	meta: {
		type: "problem",
		docs: { description: "Don't log raw user content (AGENTS.md: Logging)." },
	},
	create(context) {
		return {
			CallExpression(node) {
				if (!isLogCall(node)) return;
				for (const arg of node.arguments) {
					const found = findUserContent(arg);
					if (found) {
						context.report({
							node: arg,
							message: `Don't log user content (${found}). Log IDs, counts or lengths instead.`,
						});
						return;
					}
				}
			},
		};
	},
};

const isZodChain = (node) => {
	let current = node;
	while (current) {
		if (current.type === "Identifier") return current.name === "z";
		if (current.type === "MemberExpression") current = current.object;
		else if (current.type === "CallExpression") current = current.callee;
		else return false;
	}
	return false;
};

const nullableAiSchemaFields = {
	meta: {
		type: "problem",
		docs: {
			description:
				"In files that request structured AI output, use .nullable() instead of .optional(): OpenAI strict schemas send null for unused fields.",
		},
	},
	create(context) {
		let requestsStructuredOutput = false;
		return {
			ImportDeclaration(node) {
				if (node.source.value !== "ai") return;
				requestsStructuredOutput ||= node.specifiers.some(
					(s) =>
						s.imported && ["generateObject", "streamObject", "Output"].includes(s.imported.name),
				);
			},
			CallExpression(node) {
				if (!requestsStructuredOutput) return;
				const callee = node.callee;
				if (
					callee.type === "MemberExpression" &&
					callee.property.type === "Identifier" &&
					callee.property.name === "optional" &&
					isZodChain(callee.object)
				) {
					context.report({
						node: callee.property,
						message:
							"Use .nullable() in AI output schemas. OpenAI strict mode returns null for unused fields, which .optional() rejects.",
					});
				}
			},
		};
	},
};

export default {
	meta: { name: "local" },
	rules: {
		"no-user-content-in-logs": noUserContentInLogs,
		"nullable-ai-schema-fields": nullableAiSchemaFields,
	},
};
