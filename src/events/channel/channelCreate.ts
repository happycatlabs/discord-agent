import { Events, type GuildChannel } from "discord.js"; // Added GuildChannel
import { reportEventError } from "../util";

export const name = Events.ChannelCreate;

export const execute = async (channel: GuildChannel) => {
	try {
		// Ensure channel has a name property, common for most guild channels
		const channelName = channel.name || "Unknown Channel";
		console.log(`Channel created: ${channelName} (ID: ${channel.id}, Type: ${channel.type})`);
		// Existing logic for channelDetails can be kept if needed, or removed if the log is sufficient.
		// For this task, we'll assume the new log is the primary requirement.
		// const channelDetails = {
		// 	id: channel.id,
		// 	name: channelName,
		// 	type: channel.type,
		// };
	} catch (error) {
		reportEventError("channelCreate", error, {
			channelId: channel?.id,
			channelName: channel?.name,
		});
	}
};

export const channelCreate = { name, execute };
