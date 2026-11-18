import { ChannelType } from "discord.js";
import { DISCORD_CLIENT } from "../..";

export const getUsersInCurrentVoiceChannel = async ({
	serverId,
	idOfUserInVoiceChannel: userId,
}: {
	serverId: string;
	idOfUserInVoiceChannel: string;
}) => {
	const server = await DISCORD_CLIENT.guilds.fetch(serverId);

	const user = await server.members.fetch(userId);

	const voiceChannel = user.voice.channel;

	const users = voiceChannel?.members.map((member) => ({
		id: member.id,
		username: member.user.username,
		mentionString: `<@${member.id}>`,
	}));

	return users;
};

export const getUser = async ({ id }: { id: string }) => {
	const user = await DISCORD_CLIENT.users.fetch(id);

	const { username, tag, discriminator, avatar, bot, id: userId, globalName } = user;
	return {
		username,
		tag,
		discriminator,
		avatar,
		bot,
		userId,
		globalName,
		useThisNameToMentionTheUser: `<@${userId}>`,
	};
};

export const getServerMembers = async ({ serverId }: { serverId: string }) => {
	// fetch members using discord client
	const server = await DISCORD_CLIENT.guilds.fetch(serverId);
	const members = await server.members.fetch();

	return members.map((member) => ({
		id: member.id,
		username: member.user.username,
		mentionString: `<@${member.id}>`,
	}));
};

export const getUsersInVoiceChannels = async ({ serverId }: { serverId: string }) => {
	const server = await DISCORD_CLIENT.guilds.fetch(serverId);
	const voiceChannels = server.channels.cache.filter(
		(channel) => channel.type === ChannelType.GuildVoice,
	);

	const usersInVoiceChannels = voiceChannels.map((channel) => {
		const users = (channel.isVoiceBased() ? [...channel.members.values()] : []).map((member) => ({
			id: member.id,
			username: member.user.username,
			mentionString: `<@${member.id}>`,
		}));

		return {
			channel: channel.name,
			users,
		};
	});

	return usersInVoiceChannels;
};

export const dmUser = async ({ userId, message }: { userId: string; message: string }) => {
	try {
		const user = await DISCORD_CLIENT.users.fetch(userId);

		if (user) {
			await user.send(message);
			return { success: true };
		}
		return { success: false, error: "User not found" };
	} catch (error) {
		return { success: false, error: String(error) };
	}
};
