require("dotenv").config();

import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import chalk from "chalk";
import { z } from "zod";
import { type DelegationContext, routeMessage } from "../ai/agents";
import {
	formatSearchSourceContext,
	formatSearchSources,
	getLatestSearchSources,
	type SearchSourceCapture,
} from "../db/search-sources";
import { FEATURES, PermissionStatus } from "../ai/functions";
import { AGENT_MENTION_STRING, AGENT_USER_ID } from "../constants";

import { StoredMessage } from "../types/messages";

const isSourceFollowup = (message: string) =>
	/\b(what (were|are) (your|the) sources|show( me)? (your|the)? sources|where did you get (that|this|it)|what did you use|sources\??|citations\??|links\??)\b/i.test(
		message.trim(),
	);

const isMoreInfoFollowup = (message: string) =>
	/\b(tell me more|more info|more information|more detail|more details|go deeper|expand on that|what else|anything else|can you elaborate|elaborate|continue)\b/i.test(
		message.trim(),
	);

export const chat = async ({
	prompt,
	model = "gpt-4o-2024-08-06",
	messages,
	system,
	json = false,
	userId,
}: {
	prompt?: string;
	messages?: any[];
	model?: string;
	system?: string;
	json?: boolean;
	userId?: string;
}) => {
	try {
		if (!prompt && !messages)
			throw new Error("You must provide either a prompt or messages to chat()");

		const chatMessages = messages || [
			...(system ? [{ role: "system", content: system }] : []),
			{ role: "user", content: prompt },
		];

		if (json) {
			const result = await generateObject({
				model: openai(model),
				messages: chatMessages,
				output: "no-schema",
				...(userId && {
					providerOptions: {
						openai: {
							user: userId,
						},
					},
				}),
			});

			return {
				response: JSON.stringify(result.object),
			};
		}
		const result = await generateText({
			model: openai(model),
			messages: chatMessages,
			...(userId && {
				providerOptions: {
					openai: {
						user: userId,
					},
				},
			}),
		});

		return {
			response: result.text,
		};
	} catch (error) {
		console.error("Error chatting with AI using chat():", error);

		return {
			error,
		};
	}
};

export const chatFromDiscord = async ({
	user,
	serverId,
	channelId,
	message,
	recentMessages,
	onStatus,
	onSearchSources,
	triggerMessageId,
	referencedMessageId,
}: {
	serverId?: string;
	channelId?: string;
	user?: {
		id: string;
		mentionString: string; // <@1234567890>
		username: string;
		/** Administrator or server whitelist. Unlocks server-management tools. */
		isAdmin: boolean;
	};
	message: string;
	recentMessages?: string;
	onStatus?: (message: string) => void | Promise<void>;
	onSearchSources?: (search: SearchSourceCapture) => void | Promise<void>;
	triggerMessageId?: string;
	referencedMessageId?: string;
}) => {
	try {
		if (FEATURES.agentChat.enabled === PermissionStatus.DISABLED) {
			return "I'm not allowed to chat right now.";
		}

		console.log(`🤖 Agent talking ${user?.username ? `to ${chalk.yellow(user.username)}` : ""}`);

		const latestSources =
			user?.id && channelId
				? getLatestSearchSources({
						serverId: serverId || "dm",
						channelId,
						userId: user.id,
					})
				: [];

		if (isSourceFollowup(message) && user?.id && channelId) {
			return formatSearchSources(latestSources);
		}

		const storedSourceContext = isMoreInfoFollowup(message)
			? formatSearchSourceContext(latestSources)
			: "";
		const routedMessage = storedSourceContext
			? `${message}

Stored source context from the latest search-backed answer in this chat. Use it if it is enough to answer. If it is thin, stale, or not relevant, search again instead.

${storedSourceContext}`
			: message;

		// Build delegation context for the router
		const context: DelegationContext = {
			serverId: serverId || "",
			userId: user?.id || "",
			userMentionString: user?.mentionString || "",
			username: user?.username || "unknown",
			isAdmin: Boolean(user?.isAdmin),
			originalMessage: routedMessage,
			channelId,
			triggerMessageId,
			referencedMessageId,
			reportStatus: onStatus,
			recordSearchSources: onSearchSources,
		};

		// Route through the hierarchical agent system
		const response = await routeMessage({
			message: routedMessage,
			context,
			recentMessages,
		});

		return response;
	} catch (error) {
		// @ts-ignore
		if (error.message?.startsWith("429 You exceeded your current quota")) {
			return "I can't chat right now, please try again later.";
		}
		console.error("❌ Error in chatFromDiscord:", error);
		return "I can't chat right now, please try again later.";
	}
};

const shouldReplySchema = z.object({
	shouldReply: z
		.boolean()
		.describe(
			"Set to true only if a direct textual response is required based on the conversation context. This is for continuing a conversation.",
		),
	directReply: z
		.boolean()
		.describe(
			"Set to true ONLY if there are multiple active conversations happening simultaneously and you need to clarify which specific message you're responding to. In most normal conversations, this should be false - just send a regular message.",
		),
	shouldReact: z
		.boolean()
		.optional()
		.describe(
			"Set to true *only* for low-effort acknowledgments (e.g., humor, agreement, sympathy) where a full text response is unnecessary and no reply is being made. This should be used sparingly. If in doubt, leave this false.",
		),
	reaction: z
		.string()
		.optional()
		.describe(
			"If shouldReact is true, provide a single, context-appropriate emoji to use for the reaction. Choose a common and fitting emoji.",
		),
});

export const checkIfShouldReply = async ({
	lastAgentMessage,
	recentMessages,
	usersMessage,
}: {
	lastAgentMessage?: StoredMessage;
	recentMessages: string;
	usersMessage: string;
}) => {
	try {
		const response = await generateObject({
			model: openai("gpt-4o-2024-08-06"),
			schema: shouldReplySchema,
			messages: [
				{
					role: "system",
					content: `
You are ${AGENT_MENTION_STRING} (ID: ${AGENT_USER_ID}).
Analyze if a Discord message requires a response from you as a normal conversation participant.

**Context:**
${lastAgentMessage ? `* **Bot's Last Message:** ${JSON.stringify(lastAgentMessage, null, 2)}` : ""}
* **Recent Chat History:** ${recentMessages}
* **User's Current Message:** ${usersMessage}

**WHEN TO REPLY (shouldReply = true):**

1. **Direct mentions** - Message contains ${AGENT_MENTION_STRING} or your name
2. **Active back-and-forth** - User is directly continuing a conversation thread with you (responding to your last message, following up on a topic you were discussing)
3. **Questions or requests** - User asks a question or makes a request that invites a response
4. **Natural conversational flow** - User shares something substantive after you asked or commented, clearly expecting engagement
5. **Direct responses** - User answering your question or giving a meaningful reply to what you said (not just brief acknowledgments)

**WHEN NOT TO REPLY (shouldReply = false):**

1. **Talking to others** - Message clearly directed at another specific user
2. **General announcements** - Broad statements not expecting responses ("going to bed", "brb")
3. **Side conversations** - Multiple people chatting and you weren't involved, or conversation has moved on to others
4. **Simple acknowledgments** - Brief reactions like "lol", "nice", "yeah", "cool", "the usual garbage", "typical" that don't invite continued dialogue
5. **Conversational lulls** - User made a brief comment that naturally ends the exchange
6. **Context shifted** - If the conversation has moved on to other topics or other people are now actively engaging

**IMPORTANT CONSISTENCY RULE:**
If a message seems response-worthy now, it should still seem so a few seconds later unless the context has drastically changed (e.g., multiple new people joined the conversation, topic completely shifted, or clear conversational closure occurred). Brief acknowledgments and one-word reactions rarely deserve responses.

**WHEN TO REACT (RARELY, shouldReact = true):**

**CRITICAL RULE: NEVER react if you are in an active, back-and-forth conversation.** A reaction is not a substitute for a reply. It is a low-signal acknowledgment for a message that stands alone and does not invite a response. If you just sent a message, or just received one as part of a dialogue, you should NOT react.

React *only* in these specific cases:
- A user posts an image, meme, or link with no other comment.
- A user shares a short, relatable, or funny status-like update ("just hit a sick shot" → 🔥).
- A user expresses simple agreement with something you said much earlier ("facts" → 💯).

**WHEN TO DO NOTHING (shouldReply = false, shouldReact = false):**

**This is your default action.** In a flowing conversation, you either reply or you do nothing. If a message doesn't need a text response, you almost always ignore it. Let the conversation breathe. **If you have any doubt, do nothing.** Silence is always better than an unnecessary or awkward reaction.

**Key principle:** Your job is to be a natural participant. Natural participants don't feel the need to acknowledge every single message.

**Direct Reply Logic:**
- Use directReply=true ONLY when there are multiple people having different conversations at the same time and it would be genuinely confusing who you're talking to
- For normal back-and-forth conversation (even when someone @mentions you), use directReply=false
- **Default behavior: directReply=false** - most conversations don't need direct replies
- Think: "Would a normal person need to clarify who they're talking to here?" If no, then directReply=false
`,
				},
			],
		});

		const parsed = response.object;

		if (!parsed) {
			return { shouldReply: false, directReply: false, shouldReact: false };
		}

		console.log(
			`🤖 Reply: shouldReply=${parsed.shouldReply}, directReply=${parsed.directReply}, shouldReact=${parsed.shouldReact}, reaction=${parsed.reaction}`,
		);

		return parsed;
	} catch (error) {
		console.error("❌ Error in checkIfShouldReply:", error);
		// Return safe defaults on error
		return { shouldReply: false, directReply: false, shouldReact: false };
	}
};
