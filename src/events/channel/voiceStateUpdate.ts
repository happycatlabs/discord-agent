import { Events, type VoiceState } from "discord.js";
import { handleVoiceChannelUpdate } from "../../lib/handlers/voiceChannel";
import { reportEventError } from "../util";

export const name = Events.VoiceStateUpdate;

export const execute = async (oldState: VoiceState, newState: VoiceState) => {
	try {
		// Handle voice channel join and leave
		await handleVoiceChannelUpdate(oldState, newState);
	} catch (error) {
		reportEventError("voiceStateUpdate", error, {
			guildId: newState.guild?.id ?? oldState.guild?.id,
			userId: newState.member?.user.id ?? oldState.member?.user.id,
		});
	}

	// Handle voice channel mute and deafen
	// - only if the user was in a voice channel
	// if (oldState?.channelId) {
	// 	await handleVoiceChannelMute(oldState, newState);
	// 	await handleVoiceChannelDeafen(oldState, newState);
	// }
};

export const voiceStateUpdate = { name, execute };
