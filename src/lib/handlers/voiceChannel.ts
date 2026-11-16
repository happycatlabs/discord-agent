import type { Guild, VoiceState } from "discord.js";
import capitalize from "lodash.capitalize";
import { VOICE_XP_MIN_SESSION_SECONDS, VOICE_XP_PER_MINUTE } from "../constants/economy";
import { FEATURE_LEVELING } from "../constants/flags";
import { getEconomyConfig } from "../db/economy";
import { endVoiceSession, startVoiceSession } from "../db/voice-sessions";
import {
	applyRoleReward,
	awardXpWithGain,
	calculateVoiceXp,
	sendLevelUpAnnouncement,
} from "../economy/xp";
import { LogType, log } from "../util";
import { LogCategory, logVoiceStateUpdateEvent } from "../util/logging";

export async function handleVoiceChannelDeafen(oldState: VoiceState, newState: VoiceState) {
	const memberTag = newState.member?.user.tag;
	const memberId = newState.member?.user.id;

	const newChannelField = {
		name: "Channel",
		value: `<#${newState.channelId}>`,
	};

	// User deafens
	if (!oldState.deaf && newState.deaf) {
		const serverDeafened = !oldState.serverDeaf && newState.serverDeaf;

		if (serverDeafened) {
			log(`${memberTag} was server deafened`, LogType.VOICE_STATE_UPDATE);
		} else {
			log(`${memberTag} deafened`, LogType.VOICE_STATE_UPDATE);
		}

		const description = serverDeafened
			? `<@${memberId}> was server deafened`
			: `<@${memberId}> deafened`;

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description,
			fields: [newChannelField],
			category: LogCategory.VOICE,
		});
	}

	// User is undeafened
	else if (oldState.deaf && !newState.deaf) {
		const serverUndeafened = oldState.serverDeaf && !newState.serverDeaf;
		if (serverUndeafened) {
			log(`${memberTag} was server undeafened`, LogType.VOICE_STATE_UPDATE);
		} else {
			log(`${memberTag} undeafened`, LogType.VOICE_STATE_UPDATE);
		}

		const description = serverUndeafened
			? `<@${memberId}> was server undeafened`
			: `<@${memberId}> undeafened`;

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description,
			fields: [newChannelField],
			category: LogCategory.VOICE,
		});
	}
}
export async function handleVoiceChannelMute(oldState: VoiceState, newState: VoiceState) {
	const memberTag = newState.member?.user.tag;

	const newChannelField = {
		name: "Channel",
		value: `<#${newState.channelId}>`,
	};
	// User mutes
	if (!oldState.mute && newState.mute) {
		log(`${memberTag} muted`, LogType.VOICE_STATE_UPDATE);

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description: `<@${newState.member?.user.id}> muted`,
			fields: [newChannelField],
			category: LogCategory.VOICE,
		});
	}

	// User unmuted
	else if (oldState.mute && !newState.mute) {
		log(`${memberTag} unmuted`, LogType.VOICE_STATE_UPDATE);

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description: `<@${newState.member?.user.id}> unmuted`,
			fields: [newChannelField],
			category: LogCategory.VOICE,
		});
	}

	// User is server muted
	if (!oldState.serverMute && newState.serverMute) {
		log(`${memberTag} was server muted`, LogType.VOICE_STATE_UPDATE);

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description: `<@${newState.member?.user.id}> was server muted`,
			fields: [newChannelField],
			category: LogCategory.VOICE,
		});
	}

	// User is server unmuted
	else if (oldState.serverMute && !newState.serverMute) {
		log(`${memberTag} was server unmuted`, LogType.VOICE_STATE_UPDATE);

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description: `<@${newState.member?.user.id}> was server unmuted`,
			fields: [newChannelField],
			category: LogCategory.VOICE,
		});
	}
}
export async function handleVoiceChannelUpdate(oldState: VoiceState, newState: VoiceState) {
	// We only award XP for real members (ignore bot voice events).
	if (newState.member?.user.bot) return;

	const muteStatus = newState.mute ? "muted" : "unmuted";
	const deafStatus = newState.deaf ? "deafened" : "undeafened";

	const memberTag = newState.member?.user.tag;
	const channelName = newState.channel?.name;

	const newChannelField = {
		name: "Channel",
		value: `<#${newState.channelId}>`,
	};

	// User joins a voice channel
	if (!oldState.channel && newState.channel) {
		log(
			`${memberTag} joined a voice channel (#${channelName}, ${muteStatus} and ${deafStatus})`,
			LogType.VOICE_STATE_UPDATE,
		);

		// Track voice session
		if (newState.guild?.id && newState.member?.id && newState.channelId) {
			startVoiceSession({
				serverId: newState.guild.id,
				userId: newState.member.id,
				channelId: newState.channelId,
			});
		}

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Green",
			description: `<@${newState.member?.user.id}> joined a voice channel`,
			fields: [
				newChannelField,
				{ name: "Status", value: `${capitalize(muteStatus)} and ${deafStatus}` },
			],
			category: LogCategory.VOICE,
		});
	}

	// User leaves a voice channel
	else if (oldState.channel && !newState.channel) {
		log(
			`${memberTag} left a voice channel (#${oldState.channel?.name})`,
			LogType.VOICE_STATE_UPDATE,
		);

		// End voice session and award XP based on time spent in VC.
		if (oldState.guild?.id && oldState.member?.id) {
			const durationSeconds = endVoiceSession({
				serverId: oldState.guild.id,
				userId: oldState.member.id,
				channelId: oldState.channelId ?? undefined,
			});

			if (durationSeconds !== null) {
				await awardVoiceXp({
					guild: oldState.guild,
					userId: oldState.member.id,
					durationSeconds,
				});
			}
		}

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Red",
			description: `<@${newState.member?.user.id}> left a voice channel`,
			fields: [
				{
					name: "Channel",
					value: `<#${oldState.channelId}>`,
				},
			],
			category: LogCategory.VOICE,
		});
	}

	// User switches voice channel
	else if (oldState.channel?.id !== newState.channel?.id) {
		log(
			`${memberTag} switched from ${oldState.channel?.name} to ${channelName}`,
			LogType.VOICE_STATE_UPDATE,
		);
		log(
			`${memberTag} is currently ${newState.mute ? "muted" : "unmuted"} and ${
				newState.deaf ? "deafened" : "undeafened"
			}`,
			LogType.VOICE_STATE_UPDATE,
		);

		// End old session, award XP, and start the new session segment.
		if (newState.guild?.id && newState.member?.id) {
			const durationSeconds = endVoiceSession({
				serverId: newState.guild.id,
				userId: newState.member.id,
				channelId: oldState.channelId ?? undefined,
			});
			if (durationSeconds !== null) {
				await awardVoiceXp({
					guild: newState.guild,
					userId: newState.member.id,
					durationSeconds,
				});
			}
			if (newState.channelId) {
				startVoiceSession({
					serverId: newState.guild.id,
					userId: newState.member.id,
					channelId: newState.channelId,
				});
			}
		}

		await logVoiceStateUpdateEvent({
			oldState,
			newState,
			color: "Yellow",
			description: `<@${newState.member?.user.id}> switched voice channels`,
			fields: [
				{
					name: "From",
					// link to channel
					value: `<#${oldState.channelId}>`,
				},
				{
					name: "To",
					// link to channel
					value: `<#${newState.channelId}>`,
				},
				{ name: "Status", value: `${capitalize(muteStatus)} and ${deafStatus}` },
			],
			category: LogCategory.VOICE,
		});
	}
}

const awardVoiceXp = async ({
	guild,
	userId,
	durationSeconds,
}: {
	guild: Guild;
	userId: string;
	durationSeconds: number;
}) => {
	if (!FEATURE_LEVELING) return;
	// Awarding XP on session end avoids double-counting and keeps logic deterministic.
	const { xpGain } = calculateVoiceXp({
		durationSeconds,
		xpPerMinute: VOICE_XP_PER_MINUTE,
		minSessionSeconds: VOICE_XP_MIN_SESSION_SECONDS,
	});

	if (xpGain <= 0) return;

	const xpResult = awardXpWithGain({
		serverId: guild.id,
		userId,
		xpGain,
		updateLastXpAt: false,
	});

	if (!xpResult?.leveledUp) return;

	const config = getEconomyConfig({ serverId: guild.id });
	await sendLevelUpAnnouncement({
		guild,
		userId,
		newLevel: xpResult.newLevel,
		channelId: config.levelup_channel_id,
	});

	if (xpResult.roleId) {
		await applyRoleReward({
			guild,
			userId,
			roleId: xpResult.roleId,
		});
	}
};
