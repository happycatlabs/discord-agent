import { AuditLogEvent, EmbedBuilder, type Guild, type GuildAuditLogsEntry } from "discord.js";
import { DISCORD_CLIENT } from "../..";
import { sendMessageToLogChannel } from "../util/logging";

export async function handleKick({
	auditLog,
	guild,
}: {
	auditLog: GuildAuditLogsEntry;
	guild: Guild;
}) {
	const { action, executorId, targetId } = auditLog;

	// Check only for kicked users.
	if (action !== AuditLogEvent.MemberKick) return;

	// Ensure the executor is cached.
	const executor = await DISCORD_CLIENT.users.fetch(executorId as string);

	// Ensure the kicked guild member is cached.
	const kickedUser = await DISCORD_CLIENT.users.fetch(targetId as string);

	const embed = new EmbedBuilder()
		.setColor("Yellow")
		.setTitle("Member kicked")
		.setDescription(`<@${kickedUser.id}> was kicked by <@${executor.id}>.`);

	if (auditLog.reason) {
		embed.addFields([
			{
				name: "Reason",
				value: `${auditLog.reason || "Unspecified"}`,
			},
		]);
	}

	await sendMessageToLogChannel({
		event: { guild },
		serverId: guild.id,
		embed,
		reference: true,
	});
}

export const handleBan = async ({
	auditLog,
	guild,
}: {
	auditLog: GuildAuditLogsEntry;
	guild: Guild;
}) => {
	const { action, executorId, targetId } = auditLog;

	// Check only for banned users.
	if (action !== AuditLogEvent.MemberBanAdd) return;

	// Ensure the executor is cached.
	const executor = await DISCORD_CLIENT.users.fetch(executorId as string);

	// Ensure the banned guild member is cached.
	const bannedUser = await DISCORD_CLIENT.users.fetch(targetId as string);

	const embed = new EmbedBuilder()
		.setColor("Red")
		.setTitle("Member banned")
		.setDescription(`<@${bannedUser.id}> was banned by <@${executor.id}>.`);

	if (auditLog.reason) {
		embed.addFields([
			{
				name: "Reason",
				value: `${auditLog.reason || "Unspecified"}`,
			},
		]);
	}

	await sendMessageToLogChannel({
		event: { guild },
		serverId: guild.id,
		embed,
		reference: true,
	});
};
export const handleUnban = async ({
	auditLog,
	guild,
}: {
	auditLog: GuildAuditLogsEntry;
	guild: Guild;
}) => {
	const { action, executorId, targetId } = auditLog;

	// Check only for unbanned users.
	if (action !== AuditLogEvent.MemberBanRemove) return;

	// Ensure the executor is cached.
	const executor = await DISCORD_CLIENT.users.fetch(executorId as string);

	// Ensure the unbanned guild member is cached.
	const unbannedUser = await DISCORD_CLIENT.users.fetch(targetId as string);

	const embed = new EmbedBuilder()
		.setColor("Green")
		.setTitle("Member unbanned")
		.setDescription(`<@${unbannedUser.id}> was unbanned by <@${executor.id}>.`);

	await sendMessageToLogChannel({
		event: { guild },
		serverId: guild.id,
		embed,
	});
};
