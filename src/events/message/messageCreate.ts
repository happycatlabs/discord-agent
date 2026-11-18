import * as Sentry from "@sentry/node";
import {
	type BaseGuildTextChannel,
	EmbedBuilder,
	Events,
	type Message,
	type MessageCreateOptions,
	type MessageEditOptions,
} from "discord.js";
import { AGENT_USER_ID } from "../../lib/constants";
import { FEATURE_LEVELING } from "../../lib/constants/flags";
import { getEconomyConfig } from "../../lib/db/economy";
import { getServer } from "../../lib/db/guild";
import { checkIfUserIsWhitelisted } from "../../lib/db/guild/whitelist-user";
import {
	getLastAgentMessageFromChannel,
	storeAgentMessage,
	storeMessage,
} from "../../lib/db/messages";
import {
	storeSearchSourcesForResponse,
	type SearchSourceCapture,
} from "../../lib/db/search-sources";
import { applyRoleReward, awardXp, sendLevelUpAnnouncement } from "../../lib/economy/xp";
import { getServerProperties, getUserProperties } from "../../lib/util";
import { type ReplyDecision, chatFromDiscord, checkIfShouldReply } from "../../lib/util/openai";
import { sanitizeAgentResponse } from "../../lib/util/response-content";
import { reportEventError } from "../util";

// The bot only joins in on its own while it has spoken in the channel this recently.
const AMBIENT_WINDOW_SECONDS = 20 * 60;
const DISCORD_CONTENT_LIMIT = 2000;
const DISCORD_SAFE_CONTENT_LIMIT = 1900;
const AGENT_MENTION_REGEX = new RegExp(`^<@!?${AGENT_USER_ID}>(?:\\s|$)`);

type DiscordMessageFetchError = {
	code?: number;
	rawError?: {
		code?: number;
		message?: string;
	};
	status?: number;
	method?: string;
	url?: string;
};

type FetchErrorContext = {
	stage: string;
	channelId?: string;
	messageId?: string;
	rootMessageId?: string;
	guildId?: string;
};

type SendableDiscordChannel = {
	id: string;
	send(content: string | MessageCreateOptions): Promise<Message>;
	messages?: {
		fetch(options: {
			limit: number;
			cache?: boolean;
		}): Promise<Iterable<Message> | { values(): Iterable<Message> }>;
	};
};

type TypingDiscordChannel = {
	sendTyping?: () => Promise<void>;
};

const activeStatusByChannel = new Map<string, { token: symbol; message?: Message }>();

function splitDiscordContent(content: string): string[] {
	if (content.length <= DISCORD_CONTENT_LIMIT) return [content];

	const chunks: string[] = [];
	let remaining = content.trim();

	while (remaining.length > DISCORD_SAFE_CONTENT_LIMIT) {
		const slice = remaining.slice(0, DISCORD_SAFE_CONTENT_LIMIT);
		const splitAt = Math.max(
			slice.lastIndexOf("\n\n"),
			slice.lastIndexOf("\n"),
			slice.lastIndexOf(" "),
		);
		const end = splitAt > 1000 ? splitAt : DISCORD_SAFE_CONTENT_LIMIT;
		chunks.push(remaining.slice(0, end).trim());
		remaining = remaining.slice(end).trim();
	}

	if (remaining) chunks.push(remaining);
	return chunks;
}

async function sendDiscordContent({
	channel,
	content,
	replyTo,
	options,
}: {
	channel: SendableDiscordChannel;
	content: string;
	replyTo?: Message;
	options?: Omit<MessageCreateOptions, "content">;
}) {
	const chunks = splitDiscordContent(content);
	const sentMessages: Message[] = [];

	for (const [index, chunk] of chunks.entries()) {
		const payload = index === 0 && options ? { ...options, content: chunk } : chunk;
		const sent =
			index === 0 && replyTo
				? await replyTo.reply(payload as string | MessageCreateOptions)
				: await channel.send(payload);
		sentMessages.push(sent);
	}

	return sentMessages;
}

function startTypingUntilDone(channel: TypingDiscordChannel) {
	let stopped = false;

	const sendTyping = () => {
		if (stopped || !channel.sendTyping) return;
		channel.sendTyping().catch((error) => {
			console.warn("[typing] failed to send typing indicator", error);
		});
	};

	sendTyping();
	const interval = setInterval(sendTyping, 7000);

	return {
		stop() {
			stopped = true;
			clearInterval(interval);
		},
	};
}

function getStatusEmoji(message: string) {
	const normalized = message.toLowerCase();
	if (normalized.includes("search")) return "🔎";
	if (normalized.includes("reading")) return "📖";
	if (normalized.includes("image")) return "🖼️";
	if (normalized.includes("news")) return "📰";
	if (normalized.includes("permission")) return "🛡️";
	if (normalized.includes("thread")) return "🧵";
	if (normalized.includes("reaction")) return "🏷️";
	if (normalized.includes("stats") || normalized.includes("server")) return "📊";
	if (normalized.includes("channel")) return "#️⃣";
	return "🛠️";
}

function capitalizeStatus(message: string) {
	const trimmed = message.trim();
	if (!trimmed) return trimmed;
	return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function buildStatusEmbed(message: string) {
	const displayMessage = capitalizeStatus(message);
	return new EmbedBuilder()
		.setColor(0x5865f2)
		.setDescription(`${getStatusEmoji(message)} **${displayMessage}**`);
}

function isProgressStatusMessage(message: Message) {
	if (message.author?.id !== AGENT_USER_ID) return false;
	if (
		/^>\s*(searching|reading|checking|looking|working|creating|setting up|using)/i.test(
			message.content ?? "",
		)
	) {
		return true;
	}

	return message.embeds.some((embed) => {
		const description = embed.description ?? "";
		return /(searching|reading|checking|looking|working|creating|setting up|using).*\.\.\./i.test(
			description,
		);
	});
}

function isDirectBotMention(content: string) {
	return AGENT_MENTION_REGEX.test(content.trimStart());
}

function stripLeadingBotMention(content: string) {
	return content.trimStart().replace(AGENT_MENTION_REGEX, "").trimStart();
}

async function deleteRecentProgressStatuses(
	channel: SendableDiscordChannel,
	keepMessageId?: string,
) {
	if (!channel.messages?.fetch) return;
	try {
		const fetched = await channel.messages.fetch({ limit: 20, cache: false });
		const messages = "values" in fetched ? Array.from(fetched.values()) : Array.from(fetched);
		await Promise.all(
			messages
				.filter((message) => message.id !== keepMessageId && isProgressStatusMessage(message))
				.map((message) => message.delete().catch(() => undefined)),
		);
	} catch (error) {
		console.warn("[agent-status] failed to clean old status messages", error);
	}
}

function createStatusReporter(channel: SendableDiscordChannel) {
	const token = Symbol(channel.id);
	const previous = activeStatusByChannel.get(channel.id);
	previous?.message?.delete().catch(() => undefined);
	activeStatusByChannel.set(channel.id, { token });

	let statusMessage: Message | undefined;
	let lastStatus = "";
	let queue = deleteRecentProgressStatuses(channel);

	const update = (message: string) => {
		const nextStatus = message.trim();
		if (!nextStatus || nextStatus === lastStatus) return queue;
		lastStatus = nextStatus;

		queue = queue
			.then(async () => {
				const active = activeStatusByChannel.get(channel.id);
				if (active?.token !== token) return;

				const payload: MessageCreateOptions & MessageEditOptions = {
					embeds: [buildStatusEmbed(nextStatus)],
				};
				if (!statusMessage) {
					statusMessage = await channel.send(payload);
					activeStatusByChannel.set(channel.id, { token, message: statusMessage });
					await deleteRecentProgressStatuses(channel, statusMessage.id);
					return;
				}
				await statusMessage.edit(payload);
			})
			.catch((error) => {
				console.warn("[agent-status] failed to update status message", error);
			});

		return queue;
	};

	const clear = async () => {
		await queue;
		const active = activeStatusByChannel.get(channel.id);
		if (active?.token === token) {
			activeStatusByChannel.delete(channel.id);
		}
		if (!statusMessage) return;
		await statusMessage.delete().catch((error) => {
			console.warn("[agent-status] failed to delete status message", error);
		});
		statusMessage = undefined;
	};

	return { update, clear };
}

function persistSearchSourcesForReply({
	searchSources,
	serverId,
	channelId,
	userId,
	userMessageId,
	responseMessageId,
}: {
	searchSources: SearchSourceCapture[];
	serverId: string;
	channelId: string;
	userId: string;
	userMessageId: string;
	responseMessageId: string;
}) {
	if (searchSources.length === 0) return;
	try {
		storeSearchSourcesForResponse({
			serverId,
			channelId,
			userId,
			userMessageId,
			responseMessageId,
			searches: searchSources,
		});
	} catch (error) {
		console.error("Failed to store search sources for response", error);
	}
}

async function sendAgentResponse({
	channel,
	content,
	replyTo,
}: {
	channel: SendableDiscordChannel;
	content: string;
	replyTo?: Message;
}) {
	const cleanContent = sanitizeAgentResponse(content);

	const [sent] = await sendDiscordContent({
		channel,
		content: cleanContent,
		replyTo,
	});

	return sent;
}

function reportDiscordMessageFetchError(error: unknown, context: FetchErrorContext): void {
	const possibleError = error as DiscordMessageFetchError & { message?: string };
	const errorCode = possibleError?.code ?? possibleError?.rawError?.code;
	const errorMessage =
		possibleError?.rawError?.message ??
		possibleError?.message ??
		(error instanceof Error ? error.message : undefined);
	const isUnknownMessage = errorCode === 10008;
	const logPrefix = `[messageCreate] ${context.stage}`;
	const logFn = isUnknownMessage ? console.warn : console.error;

	logFn(
		`${logPrefix} - failed to fetch message ${context.messageId ?? "unknown"} in channel ${context.channelId ?? "unknown"}`,
		error,
	);

	Sentry.withScope((scope) => {
		scope.setTag("event.handler", "messageCreate");
		if (errorCode) {
			scope.setTag("discord.error_code", `${errorCode}`);
		}
		if (context.guildId || context.channelId || context.rootMessageId) {
			scope.setContext("discord_message_context", {
				guildId: context.guildId,
				channelId: context.channelId,
				rootMessageId: context.rootMessageId,
				referenceMessageId: context.messageId,
			});
		}
		scope.setContext("discord_error_details", {
			stage: context.stage,
			errorCode,
			errorMessage,
			status: possibleError?.status,
			method: possibleError?.method,
			url: possibleError?.url,
		});

		if (isUnknownMessage) {
			scope.setLevel("warning");
			Sentry.captureMessage(
				`Discord message fetch returned Unknown Message (10008) at ${context.stage}`,
			);
		} else {
			Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

async function shouldReplyToMessage(message: Message, initialReference?: Message | null) {
	let referenceMessage: Message | null = initialReference ?? null;
	if (!referenceMessage && message.reference?.messageId && message.channel?.messages?.fetch) {
		try {
			referenceMessage = await message.channel.messages.fetch(message.reference.messageId);
		} catch (error) {
			reportDiscordMessageFetchError(error, {
				stage: "shouldReplyToMessage.reference",
				channelId: message.channelId,
				messageId: message.reference.messageId,
				rootMessageId: message.id,
				guildId: message.guild?.id,
			});
			return false;
		}
	}

	if (referenceMessage?.author?.id !== AGENT_USER_ID) return false;

	// Get the agent mention string (use constant to avoid InvalidStateError during reconnection)
	// Get the reference chain
	const referenceChain = await getReferenceChain(message);

	// Check if the reference chain contains any messages from the author that start with the agent mention string
	for (const referenceMessage of referenceChain) {
		if (
			referenceMessage.author.id === message.author.id &&
			isDirectBotMention(referenceMessage.content)
		) {
			return true;
		}
	}

	return false;
}

async function getReferenceChain(message: Message, chain: Message[] = []) {
	chain.push(message);

	if (message.reference) {
		try {
			const referenceMessage = await message.channel.messages.fetch(
				message.reference.messageId as string,
			);
			return getReferenceChain(referenceMessage, chain);
		} catch (error) {
			reportDiscordMessageFetchError(error, {
				stage: "getReferenceChain",
				channelId: message.channelId,
				messageId: message.reference?.messageId,
				rootMessageId: message.id,
				guildId: message.guild?.id,
			});
			// Return the chain collected so far
			return chain;
		}
	}

	return chain;
}

function formatMessageForContext(message: Message) {
	const username =
		message.author?.id === AGENT_USER_ID
			? "YOU, the AI Agent"
			: (message.author.displayName ?? message.author.username);
	const date = new Date(message.createdAt).toTimeString().split(" ").slice(0, 1).join(" ");
	const attachments = message.attachments.size
		? ` Attachments: ${message.attachments
				.map((attachment) => `${attachment.name ?? "attachment"} (${attachment.url})`)
				.join(", ")}`
		: "";
	const content = message.content?.trim() || "[no text content]";

	return `${username} (${date}): ${content}${attachments}`;
}

async function handleDirectMessage(message: Message) {
	const author = getUserProperties({ userObject: message.author });
	const channel = message.channel;

	if (!channel.isSendable()) {
		console.warn(`Skipping DM ${message.id}: channel ${channel.id} is not sendable.`);
		return;
	}

	let recentMessages: Message[];
	try {
		const fetchedMessages = await channel.messages.fetch({
			limit: 25,
			cache: false,
		});
		recentMessages = Array.from(fetchedMessages.values()).reverse();
	} catch (error) {
		console.error(`Error fetching recent DM messages in channel ${message.channel.id}:`, error);
		recentMessages = [message];
	}

	const recentContext = recentMessages.map(formatMessageForContext).join("\n");
	const attachmentContext = message.attachments.size
		? `\n\nAttachments on this DM:\n${message.attachments
				.map((attachment) => `- ${attachment.name ?? "attachment"}: ${attachment.url}`)
				.join("\n")}`
		: "";
	const userMessageContent =
		message.content?.trim() || (message.attachments.size ? "Please respond to my attachment." : "");

	try {
		const typing = startTypingUntilDone(channel);
		const status = createStatusReporter(channel);
		const searchSources: SearchSourceCapture[] = [];
		let aiResponse: string | undefined;
		try {
			aiResponse = await chatFromDiscord({
				user: {
					id: author.id,
					username: author.username,
					mentionString: `<@${author.id}>`,
					isAdmin: false,
				},
				serverId: "",
				channelId: channel.id,
				triggerMessageId: message.id,
				message: `${userMessageContent}${attachmentContext}`,
				recentMessages: recentContext,
				onStatus: status.update,
				onSearchSources: (search) => {
					searchSources.push(search);
				},
			});
		} finally {
			typing.stop();
			await status.clear();
		}

		if (aiResponse) {
			const sent = await sendAgentResponse({
				channel,
				content: aiResponse,
			});
			if (sent) {
				persistSearchSourcesForReply({
					searchSources,
					serverId: "dm",
					channelId: channel.id,
					userId: author.id,
					userMessageId: message.id,
					responseMessageId: sent.id,
				});
			}
		}
	} catch (aiError) {
		console.error(`AI interaction or DM reply failed for message ${message.id}:`, aiError);
		channel.send({ content: "Sorry, I can't generate a response right now." }).catch(console.error);
	}
}

export const messageCreate = {
	name: Events.MessageCreate,
	async execute(message: Message) {
		try {
			if (message.author.bot) return;
			if (!message.guild) {
				await handleDirectMessage(message);
				return;
			}

			const author = getUserProperties({ userObject: message.author });
			const server = getServerProperties({ server: message.guild });

			const channel = message.channel as BaseGuildTextChannel;

			let _serverFromDB;
			try {
				_serverFromDB = await getServer({ serverId: server.id as string });
			} catch (error) {
				console.error(`Error fetching server ${server.id} from DB:`, error);
				return; // Early return if server info is crucial and missing
			}

			let onWhitelist = false;
			try {
				onWhitelist = await checkIfUserIsWhitelisted({
					id: author.id,
					guildId: server.id as string,
				});
			} catch (error) {
				console.error(`Error checking whitelist status for user ${author.id}:`, error);
			}

			const hasChatPerms = message.member?.permissions.has("Administrator") || onWhitelist;
			const replying = !!message.reference;
			const talkingToBot = isDirectBotMention(message.content);

			let reference: Message | undefined | null;

			if (replying) {
				try {
					reference = await message.channel.messages.fetch(message.reference?.messageId as string);
				} catch (error) {
					reportDiscordMessageFetchError(error, {
						stage: "messageCreate.execute.reference",
						channelId: message.channelId,
						messageId: message.reference?.messageId,
						rootMessageId: message.id,
						guildId: message.guild?.id,
					});
					// Continue, reference will be null
				}
			}

			const referenceContent = reference?.content;
			// Use constant to avoid InvalidStateError during reconnection
			const _userIsReplyingToBot = reference?.author.id === AGENT_USER_ID;

			// can pass this fetch function to the model as a function to use to get recent messages, as many as it'd like.
			// could be dangerous if it just keeps fetching though
			let recentMessages: Message[];
			try {
				const fetchedMessages = await message.channel.messages.fetch({
					limit: 40,
					cache: false,
				});
				recentMessages = Array.from(fetchedMessages.values());
			} catch (error) {
				console.error(`Error fetching recent messages in channel ${message.channel.id}:`, error);
				recentMessages = []; // Default to empty array
			}
			const userMessages = recentMessages.filter(
				(msg) =>
					!msg.author.bot &&
					msg.content &&
					(Date.now() - new Date(msg.createdAt).getTime()) / 1000 < 1200,
			);
			userMessages.reverse();
			recentMessages.reverse();

			const shouldReply = await shouldReplyToMessage(message, reference);

			const talkingDirectlyToBot = talkingToBot || shouldReply;

			// Summary of reactions on the user's current message (hoisted so it's available throughout)
			const currentMessageReactionSummary = message.reactions?.cache?.size
				? `Current reactions on this message: ${Array.from(message.reactions.cache.values())
						.map((r) => {
							const emoji = r.emoji.name ?? r.emoji.id ?? "?";
							const fromBot = r.me ? "*" : "";
							return `${emoji}${fromBot} x${r.count}`;
						})
						.join(" ")}`
				: "No reactions yet.";

			const messages = recentMessages
				.map((msg) => {
					const contextLine = formatMessageForContext(msg);

					const author = `${message.id} ${referenceContent ? `- replying to ${reference?.id}` : ""} - `;

					// Summarise any reactions on the message so the AI can make better decisions
					const reactionsSummary = msg.reactions?.cache?.size
						? ` | Reactions: ${Array.from(msg.reactions.cache.values())
								.map((r) => {
									const emoji = r.emoji.name ?? r.emoji.id ?? "?";
									const fromBot = r.me ? "*" : ""; // Mark reactions that include the bot itself
									return `${emoji}${fromBot} x${r.count}`;
								})
								.join(" ")}`
						: "";

					return `${author}${contextLine}${reactionsSummary}`;
				})
				.join("\n");

			let lastAgentMessage;
			try {
				lastAgentMessage = await getLastAgentMessageFromChannel({
					serverId: message.guild?.id as string,
					channelId: channel.id,
				});
			} catch (error) {
				console.error(
					`Error fetching last agent message for channel ${channel.id} in server ${message.guild?.id}:`,
					error,
				);
				// Continue, lastAgentMessage will be undefined
			}

			const secondsSinceLastAgentMessage = lastAgentMessage
				? (Date.now() - new Date(lastAgentMessage?.createdAt).getTime()) / 1000
				: Number.POSITIVE_INFINITY;

			let decision: ReplyDecision = { action: "ignore" };

			if (secondsSinceLastAgentMessage < AMBIENT_WINDOW_SECONDS && lastAgentMessage) {
				decision = await checkIfShouldReply({
					lastAgentMessage: lastAgentMessage,
					recentMessages: messages,
					usersMessage: (() => {
						// Calculate conversation state metrics
						const messagesSinceBot = recentMessages.filter(
							(m) =>
								!m.author.bot &&
								new Date(m.createdAt).getTime() > new Date(lastAgentMessage.createdAt).getTime(),
						);
						const uniqueUsersSinceBot = new Set(messagesSinceBot.map((m) => m.author.id)).size;
						const isDirectContinuation =
							messagesSinceBot.length > 0 &&
							messagesSinceBot[messagesSinceBot.length - 1]?.author.id === message.author.id;

						return `${message.author.displayName} (${message.author.id}): ${message.content} at ${new Date(message.createdAt).toLocaleString()}

${talkingDirectlyToBot ? "The user is talking directly to you." : ""}

${currentMessageReactionSummary}

**Conversation state:**
- Time since your last message: ${Math.round(secondsSinceLastAgentMessage)}s ago
- Messages since you spoke: ${messagesSinceBot.length}
- Unique users since you spoke: ${uniqueUsersSinceBot}
- Is this a direct continuation (same user responding): ${isDirectContinuation ? "YES" : "NO"}`;
					})(),
				});
			}

			if (!talkingDirectlyToBot && decision.action === "react") {
				try {
					await message.react(decision.emoji);
				} catch (reactionError) {
					console.error(`Error reacting to message ${message.id}:`, reactionError);
				}
			}

			const shouldReplyAI = decision.action === "reply";
			const shouldReplyDirectly = decision.action === "reply" && decision.quoteMessage;

			if (talkingDirectlyToBot || shouldReplyAI) {
				console.log(
					`🎯 Bot triggered to respond in channel ${channel.id} by user ${author.username} (direct: ${talkingDirectlyToBot}, AI decision: ${shouldReplyAI})`,
				);

				let userMessageContent = message.content;
				if (isDirectBotMention(userMessageContent)) {
					userMessageContent = stripLeadingBotMention(userMessageContent);
				}
				const userPromptContent =
					userMessageContent.trim() ||
					"The user directly mentioned you without extra text. Use the recent channel context to infer what they need.";
				const interactionPrompt = [
					referenceContent ? `The user replied to this message:\n\n${referenceContent}` : "",
					`Their message was: ${userPromptContent}`,
					currentMessageReactionSummary,
				]
					.filter(Boolean)
					.join("\n\n");

				try {
					const typing = startTypingUntilDone(channel);
					const status = createStatusReporter(channel);
					const searchSources: SearchSourceCapture[] = [];
					let aiResponse: string | undefined;
					try {
						aiResponse = await chatFromDiscord({
							user: {
								id: author.id,
								username: author.username,
								mentionString: `<@${author.id}>`,
								isAdmin: hasChatPerms,
								permissions: message.member?.permissions.bitfield,
							},
							serverId: server.id as string,
							channelId: channel.id,
							triggerMessageId: message.id,
							referencedMessageId: reference?.id,
							message: interactionPrompt,
							recentMessages: messages,
							onStatus: status.update,
							onSearchSources: (search) => {
								searchSources.push(search);
							},
						});
					} finally {
						typing.stop();
						await status.clear();
					}

					if (aiResponse) {
						const reply = await sendAgentResponse({
							channel,
							content: aiResponse,
							replyTo: shouldReplyDirectly ? message : undefined,
						});
						if (!reply) return;
						persistSearchSourcesForReply({
							searchSources,
							serverId: server.id as string,
							channelId: channel.id,
							userId: author.id,
							userMessageId: message.id,
							responseMessageId: reply.id,
						});

						await storeAgentMessage({
							message: {
								createdAt: reply.createdAt,
								author: reply.author.id,
								id: reply.id,
								content: aiResponse,
								server: message.guild?.id as string,
								channel: channel.id,
							},
							serverId: message.guild?.id as string,
							channelId: channel.id,
						});
					}
				} catch (aiError) {
					console.error(`AI interaction or reply failed for message ${message.id}:`, aiError);
					message
						.reply({ content: "Sorry, I can't generate a response right now." })
						.catch(console.error);
				}
			}

			// Store the user's message
			const serverDatabaseID = server.databaseID as string;
			const messageToStore: any = {
				author: message.author.id,
				createdAt: message.createdAt,
				id: message.id,
				content: message.content,
				server: serverDatabaseID,
				channel: channel.id,
				attachments: null,
			};
			const hasAttachment = message.attachments.size > 0;

			if (hasAttachment) {
				messageToStore.attachments = message.attachments.map((attachment) => {
					return {
						url: attachment.url,
						name: attachment.name,
					};
				});
			}
			try {
				await storeMessage({
					server: serverDatabaseID,
					message: messageToStore,
				});
			} catch (storeError) {
				console.error(`Error storing user message ${message.id} to DB:`, storeError);
			}

			// Award XP for the message
			try {
				if (!FEATURE_LEVELING) return;
				const xpResult = awardXp({
					serverId: server.id as string,
					userId: author.id,
				});

				if (xpResult?.leveledUp && message.guild) {
					const config = getEconomyConfig({ serverId: server.id as string });

					// Send level-up announcement
					await sendLevelUpAnnouncement({
						guild: message.guild,
						userId: author.id,
						newLevel: xpResult.newLevel,
						channelId: config.levelup_channel_id,
					});

					// Apply role reward if any
					if (xpResult.roleId) {
						await applyRoleReward({
							guild: message.guild,
							userId: author.id,
							roleId: xpResult.roleId,
						});
					}
				}
			} catch (xpError) {
				console.error(`Error awarding XP for message ${message.id}:`, xpError);
			}
		} catch (error) {
			reportEventError("messageCreate", error, {
				messageId: message.id,
				channelId: message.channel?.id,
				guildId: message.guild?.id,
			});
		}
	},
};
