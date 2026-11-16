import { Events, type GuildChannel } from "discord.js"; // Added GuildChannel
import { reportEventError } from "../util";

export const name = Events.ChannelDelete;

export const execute = async (channel: GuildChannel) => {
	try {
		// Ensure channel has a name property, common for most guild channels
		const channelName = channel.name || "Unknown Channel";
		console.log(`Channel deleted: ${channelName} (ID: ${channel.id}, Type: ${channel.type})`);
		// Existing logic for channelDetails can be kept if needed, or removed if the log is sufficient.
		// const channelDetails = {
		// 	id: channel.id,
		// 	name: channelName,
		// 	type: channel.type,
		// };
	} catch (error) {
		reportEventError("channelDelete", error, {
			channelId: channel?.id,
			channelName: channel?.name,
		});
	}
};

export const channelDelete = { name, execute };
