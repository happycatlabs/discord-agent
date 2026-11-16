import { anthropic } from "@ai-sdk/anthropic";
import * as Sentry from "@sentry/node";
import { generateObject } from "ai";
import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
	type Message,
} from "discord.js";
import { z } from "zod";
import { ADMIN_USER_IDS } from "../../lib/constants";
import { FEATURE_VECTOR_KB } from "../../lib/constants/flags";
import { checkIfUserIsWhitelisted } from "../../lib/db/guild/whitelist-user";
import {
	searchKnowledge,
	storeKnowledgeEntry,
	type KnowledgeContext,
	type KnowledgeScope,
	type KnowledgeSearchResult,
} from "../../lib/db/knowledge";
import { createLogger } from "../../lib/util/logger";

const DEFAULT_MESSAGE_LIMIT = 30;
const MAX_MESSAGE_LIMIT = 30;
const MAX_CANDIDATES = 6;
const DUPLICATE_DISTANCE_THRESHOLD = 0.22;

type Candidate = {
	title: string;
	text: string;
	reason: string;
	confidence: number;
	keywords: string[];
};

type ReviewedCandidate = Candidate & {
	duplicate: boolean;
	duplicateReason?: string;
	matches: KnowledgeSearchResult[];
};

const logger = createLogger("commands.knowledge.scan");

const candidateSchema = z.object({
	candidates: z
		.array(
			z.object({
				title: z.string().min(4).max(90).describe("Short, specific title for this knowledge item."),
				text: z
					.string()
					.min(20)
					.max(900)
					.describe("Concise durable knowledge to store. Do not include filler."),
				reason: z
					.string()
					.min(8)
					.max(180)
					.describe("Why this is worth remembering for future bot responses."),
				confidence: z
					.number()
					.min(0)
					.max(1)
					.describe("Confidence this is stable, useful knowledge grounded in the messages."),
				keywords: z
					.array(z.string().min(2).max(40))
					.max(8)
					.describe("Search keywords that should retrieve this memory later."),
			}),
		)
		.max(MAX_CANDIDATES),
});

const truncate = (value: string, maxLength: number) => {
	const clean = value.replace(/\s+/g, " ").trim();
	if (clean.length <= maxLength) return clean;
	return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
};

const normalizeForComparison = (value: string) =>
	value
		.toLowerCase()
		.replace(/https?:\/\/\S+/g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const isLikelyDuplicate = (candidate: Candidate, matches: KnowledgeSearchResult[]) => {
	const candidateText = normalizeForComparison(`${candidate.title} ${candidate.text}`);
	const meaningfulCandidateText = candidateText.length >= 80 ? candidateText : "";

	for (const match of matches) {
		const matchText = normalizeForComparison(`${match.title || ""} ${match.text}`);
		if (!matchText) continue;

		if (match.distance <= DUPLICATE_DISTANCE_THRESHOLD) {
			return {
				duplicate: true,
				reason: `close vector match: ${match.title || `entry ${match.entryId}`}`,
			};
		}

		if (
			meaningfulCandidateText &&
			(matchText.includes(meaningfulCandidateText) || meaningfulCandidateText.includes(matchText))
		) {
			return {
				duplicate: true,
				reason: `overlaps existing entry: ${match.title || `entry ${match.entryId}`}`,
			};
		}
	}

	return { duplicate: false };
};

const formatMessagesForExtraction = (messages: Message[]) =>
	messages
		.map((message) => {
			const author =
				message.member?.displayName ||
				message.author.globalName ||
				message.author.username ||
				message.author.id;
			const content = truncate(message.cleanContent || message.content || "", 900);
			const attachments = message.attachments.size
				? ` Attachments: ${message.attachments
						.map((attachment) => attachment.name || attachment.url)
						.slice(0, 3)
						.join(", ")}`
				: "";
			return `[${message.createdAt.toISOString()}] ${author}: ${content}${attachments}`;
		})
		.join("\n");

const extractCandidates = async ({
	formattedMessages,
	serverName,
	channelName,
}: {
	formattedMessages: string;
	serverName: string;
	channelName: string;
}) => {
	const result = await generateObject({
		model: anthropic("claude-haiku-4-5-20251001"),
		schema: candidateSchema,
		messages: [
			{
				role: "system",
				content: `You extract durable knowledge candidates from recent Discord channel messages.

Only return items that would improve future bot answers in this server or as global knowledge.

Good candidates:
- Stable corrections, canon/lore facts, project facts, server preferences, recurring interests, useful named entities, or decisions.
- Information that is specific enough to search for later.
- Items grounded directly in the messages.

Reject:
- One-off jokes, greetings, moods, arguments, speculation, spam, or vague opinions.
- Secrets, credentials, private contact details, medical/legal/financial advice, or sensitive personal data.
- Personal memories about a specific user unless the messages clearly establish a server-level preference or explicit bot instruction.
- Anything the messages do not clearly support.

Keep each text field concise. Do not quote long message text.`,
			},
			{
				role: "user",
				content: `Server: ${serverName}
Channel: #${channelName}

Recent messages, oldest first:
${formattedMessages}

Return at most ${MAX_CANDIDATES} knowledge candidates. Return an empty list if nothing is worth storing.`,
			},
		],
	});

	return result.object.candidates.filter((candidate) => candidate.confidence >= 0.62);
};

const isAuthorized = async (interaction: ChatInputCommandInteraction) => {
	const isAdmin = Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
	if (isAdmin) return true;
	if (!interaction.guildId) return false;

	return checkIfUserIsWhitelisted({
		id: interaction.user.id,
		guildId: interaction.guildId,
	});
};

const buildKnowledgeContext = ({
	interaction,
	authorized,
}: {
	interaction: ChatInputCommandInteraction;
	authorized: boolean;
}): KnowledgeContext => ({
	userId: interaction.user.id,
	serverId: interaction.guildId || "",
	isAdmin: authorized,
});

const reviewCandidates = async ({
	candidates,
	scope,
	context,
}: {
	candidates: Candidate[];
	scope: KnowledgeScope;
	context: KnowledgeContext;
}): Promise<ReviewedCandidate[]> => {
	const reviewed = await Promise.all(
		candidates.map(async (candidate) => {
			const matches = await searchKnowledge({
				query: `${candidate.title}\n${candidate.text}\n${candidate.keywords.join(", ")}`,
				scope,
				limit: 3,
				context,
			});
			const duplicateCheck = isLikelyDuplicate(candidate, matches);
			return {
				...candidate,
				matches,
				duplicate: duplicateCheck.duplicate,
				duplicateReason: duplicateCheck.reason,
			};
		}),
	);

	return reviewed;
};

const saveReviewedCandidates = async ({
	reviewed,
	scope,
	context,
	interaction,
}: {
	reviewed: ReviewedCandidate[];
	scope: KnowledgeScope;
	context: KnowledgeContext;
	interaction: ChatInputCommandInteraction;
}) => {
	const saved: Array<ReviewedCandidate & { entryId: number }> = [];

	for (const candidate of reviewed) {
		if (candidate.duplicate) continue;
		const result = await storeKnowledgeEntry({
			scope,
			title: candidate.title,
			text: candidate.text,
			sourceType: "discord-scan",
			metadata: {
				command: "knowledge scan",
				channelId: interaction.channelId,
				guildId: interaction.guildId,
				requestedByUserId: interaction.user.id,
				confidence: candidate.confidence,
				reason: candidate.reason,
				keywords: candidate.keywords,
			},
			context,
		});
		saved.push({ ...candidate, entryId: result.entryId });
	}

	return saved;
};

const formatCandidateLines = ({
	reviewed,
	savedEntryIds,
}: {
	reviewed: ReviewedCandidate[];
	savedEntryIds?: Map<string, number>;
}) => {
	if (reviewed.length === 0) return "No strong new candidates found in the last messages.";

	return reviewed
		.slice(0, MAX_CANDIDATES)
		.map((candidate, index) => {
			const savedEntryId = savedEntryIds?.get(candidate.title);
			const status = savedEntryId
				? `saved as #${savedEntryId}`
				: candidate.duplicate
					? `already known (${candidate.duplicateReason || "similar stored entry"})`
					: "new candidate";
			return [
				`**${index + 1}. ${truncate(candidate.title, 70)}**`,
				`${truncate(candidate.text, 220)}`,
				`_${status}; confidence ${Math.round(candidate.confidence * 100)}%_`,
			].join("\n");
		})
		.join("\n\n");
};

export const knowledge = {
	data: new SlashCommandBuilder()
		.setName("knowledge")
		.setDescription("Manage the bot knowledge base")
		.addSubcommand((subcommand) =>
			subcommand
				.setName("scan")
				.setDescription("Scan recent channel messages for knowledge worth storing")
				.addIntegerOption((option) =>
					option
						.setName("limit")
						.setDescription("Recent messages to scan")
						.setMinValue(5)
						.setMaxValue(MAX_MESSAGE_LIMIT)
						.setRequired(false),
				)
				.addStringOption((option) =>
					option
						.setName("scope")
						.setDescription("Where saved knowledge should be visible")
						.addChoices({ name: "Server", value: "server" }, { name: "Global", value: "global" })
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName("save")
						.setDescription("Save new candidates instead of only previewing them")
						.setRequired(false),
				),
		)
		.setContexts(InteractionContextType.Guild),

	async execute(interaction: ChatInputCommandInteraction) {
		try {
			if (!interaction.inGuild() || !interaction.guildId) {
				await interaction.reply({
					content: "/knowledge scan only works in servers.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const subcommand = interaction.options.getSubcommand();
			if (subcommand !== "scan") {
				await interaction.reply({
					content: "Unknown knowledge command.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			if (!FEATURE_VECTOR_KB) {
				await interaction.reply({
					content: "The vector knowledge base is disabled right now.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const authorized = await isAuthorized(interaction);
			if (!authorized) {
				await interaction.reply({
					content: "Only administrators or whitelisted users can scan channel logs for knowledge.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const channel = interaction.channel;
			if (!channel?.isTextBased?.() || !("messages" in channel)) {
				await interaction.reply({
					content: "I can only scan message-based text channels.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			const limit = interaction.options.getInteger("limit") ?? DEFAULT_MESSAGE_LIMIT;
			const scope = (interaction.options.getString("scope") ?? "server") as KnowledgeScope;
			const shouldSave = interaction.options.getBoolean("save") ?? false;
			const context = buildKnowledgeContext({ interaction, authorized });

			if (scope === "global" && shouldSave && !ADMIN_USER_IDS.includes(interaction.user.id)) {
				await interaction.reply({
					content: "Only the bot owner can save global knowledge. Use server scope instead.",
					flags: [MessageFlags.Ephemeral],
				});
				return;
			}

			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

			const fetched = await channel.messages.fetch({ limit, cache: false });
			const messages = [...fetched.values()]
				.filter(
					(message) => !message.author.bot && (message.cleanContent || message.content).trim(),
				)
				.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

			if (messages.length === 0) {
				await interaction.editReply("No recent user messages with text were found.");
				return;
			}

			const formattedMessages = formatMessagesForExtraction(messages);
			const candidates = await extractCandidates({
				formattedMessages,
				serverName: interaction.guild?.name || interaction.guildId,
				channelName: "name" in channel ? String(channel.name) : interaction.channelId,
			});
			const reviewed = await reviewCandidates({ candidates, scope, context });
			const saved = shouldSave
				? await saveReviewedCandidates({ reviewed, scope, context, interaction })
				: [];
			const savedEntryIds = new Map(saved.map((candidate) => [candidate.title, candidate.entryId]));
			const newCandidates = reviewed.filter((candidate) => !candidate.duplicate).length;
			const duplicates = reviewed.length - newCandidates;

			const embed = new EmbedBuilder()
				.setColor(shouldSave ? 0x57f287 : 0x5865f2)
				.setTitle(shouldSave ? "Knowledge scan saved" : "Knowledge scan preview")
				.setDescription(truncate(formatCandidateLines({ reviewed, savedEntryIds }), 3800))
				.addFields(
					{
						name: "Messages scanned",
						value: `${messages.length}/${limit}`,
						inline: true,
					},
					{
						name: "Scope",
						value: scope,
						inline: true,
					},
					{
						name: shouldSave ? "Saved" : "New candidates",
						value: shouldSave ? String(saved.length) : String(newCandidates),
						inline: true,
					},
				)
				.setFooter({
					text: shouldSave
						? `${duplicates} already-known candidate${duplicates === 1 ? "" : "s"} skipped`
						: "Run again with save:true to store the new candidates",
				});

			await interaction.editReply({ embeds: [embed] });

			logger.info("knowledge scan completed", {
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				userId: interaction.user.id,
				messageCount: messages.length,
				candidateCount: candidates.length,
				newCandidates,
				duplicates,
				savedCount: saved.length,
				scope,
			});
		} catch (error) {
			Sentry.captureException(error);
			logger.captureException(error, {
				message: "knowledge scan failed",
				userId: interaction.user.id,
				guildId: interaction.guildId,
				channelId: interaction.channelId,
			});

			const content = error instanceof Error ? error.message : "Failed to scan knowledge.";
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({ content, embeds: [] });
			} else {
				await interaction.reply({ content, flags: [MessageFlags.Ephemeral] });
			}
		}
	},
};
