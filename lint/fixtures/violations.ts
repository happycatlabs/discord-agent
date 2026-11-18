// Fixture for lint/__tests__/plugin.test.ts. Each marked line must be reported.
import { generateObject } from "ai";
import { z } from "zod";

export const schema = z.object({
	bad: z.string().optional(), // nullable-ai-schema-fields
	good: z.string().nullable(),
});

export const handle = (message: { content: string }, q: string) => {
	console.log(`got ${message.content}`); // no-user-content-in-logs
	console.log("length only", q.length);
	console.error("query", q); // no-user-content-in-logs
	return generateObject;
};
