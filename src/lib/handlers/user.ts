import {
	type ColorResolvable,
	EmbedBuilder,
	type GuildMember,
	type Presence,
	PresenceUpdateStatus,
} from "discord.js";
import { storeActivity } from "../db/activities";
import type { User } from "../types/user";
import { LogType, log } from "../util";
import { LogCategory, logUserStatusUpdate, sendMessageToLogChannel } from "../util/logging";

export const activityTypesMap: any = {
	0: "Playing",
	1: "Streaming",
	2: "Listening",
	3: "Watching",
	4: "Custom",
	5: "Competing",
};

export const lastStatuses: Record<string, unknown> = {};
export const lastActivities: Record<string, unknown> = {};

export const handleServerAvatarChange = async (oldMember: GuildMember, newMember: GuildMember) => {
	const oldAvatarUrl = oldMember.avatarURL();
	const newAvatarUrl = newMember.avatarURL();

	if (oldAvatarUrl === newAvatarUrl) {
		return;
	}

	console.log(
		`Server avatar update in ${newMember.guild.name}: ${newMember.user.tag} (${newAvatarUrl})`,
	);

	const embed = new EmbedBuilder().setColor("Purple").setTitle("Server avatar update").setAuthor({
		name: newMember.user.username,
		iconURL: newMember.displayAvatarURL(),
	});

	if (newMember.avatar && newAvatarUrl) {
		embed
			.setDescription(`<@${newMember.id}> updated their avatar for **${newMember.guild.name}**.`)
			.setImage(
				newMember.avatarURL({
					size: 1024,
				}),
			);
	} else {
		embed.setDescription(
			`<@${newMember.id}> removed their avatar for **${newMember.guild.name}**.`,
		);
	}

	try {
		await sendMessageToLogChannel({
			serverId: newMember.guild.id,
			embed,
			event: newMember,
			category: LogCategory.MEMBERS,
		});
	} catch (error) {
		console.log(
			`Error logging server avatar update for guild ${newMember.guild.id}: ${String(error)}`,
		);
	}
};

export const handleServerBannerChange = async (oldMember: GuildMember, newMember: GuildMember) => {
	const oldBannerUrl = oldMember.bannerURL();
	const newBannerUrl = newMember.bannerURL();

	if (oldBannerUrl === newBannerUrl) {
		return;
	}

	console.log(
		`Server banner update in ${newMember.guild.name}: ${newMember.user.tag} (${newBannerUrl})`,
	);

	const embed = new EmbedBuilder().setColor("Purple").setTitle("Server banner update").setAuthor({
		name: newMember.user.username,
		iconURL: newMember.displayAvatarURL(),
	});

	if (newMember.banner && newBannerUrl) {
		embed
			.setDescription(`<@${newMember.id}> updated their banner for **${newMember.guild.name}**.`)
			.setImage(
				newMember.bannerURL({
					size: 1024,
				}),
			);
	} else {
		embed.setDescription(
			`<@${newMember.id}> removed their banner for **${newMember.guild.name}**.`,
		);
	}

	try {
		await sendMessageToLogChannel({
			serverId: newMember.guild.id,
			embed,
			event: newMember,
			category: LogCategory.MEMBERS,
		});
	} catch (error) {
		console.log(
			`Error logging server banner update for guild ${newMember.guild.id}: ${String(error)}`,
		);
	}
};

export const handleNicknameChange = async (oldMember: GuildMember, newMember: GuildMember) => {
	const guild = newMember.guild;

	if (oldMember.nickname !== newMember.nickname) {
		console.log(`Nickname change: ${oldMember.nickname} -> ${newMember.nickname}`);

		const embed = new EmbedBuilder()
			.setColor("Yellow")
			.setDescription(`<@${newMember.id}>'s nickname was updated.`)
			.setAuthor({
				name: newMember.user.username,
				iconURL: newMember.user.avatarURL() as string,
			})
			.addFields([
				{
					name: "Before",
					value: oldMember.nickname || "None",
					inline: true,
				},
				{
					name: "After",
					value: newMember.nickname || "None",
					inline: true,
				},
			]);

		if (!oldMember.nickname) {
			embed.setTitle("Nickname added");
			embed.setColor("Green");
		} else if (!newMember.nickname) {
			embed
				.setTitle("Nickname removed")
				.setColor("Red")
				.setDescription(`<@${newMember.id}>'s nickname was removed.`);
		} else {
			embed.setTitle("Nickname updated");
		}

		await sendMessageToLogChannel({
			serverId: guild.id,
			embed,
			event: newMember,
			category: LogCategory.MEMBERS,
		});
	}
};

export const handleStatusUpdate = async ({
	oldPresence,
	newPresence,
	user,
}: {
	oldPresence: Presence;
	newPresence: Presence;
	user: User;
}) => {
	if (!oldPresence || !newPresence) return console.log(`🚨 No presence for ${user.username} (?)`);
	if (!oldPresence?.status && !newPresence?.status)
		return console.log(`🚨 No status for ${user.username} (?)`);

	const userMentionString = `<@${user.id}>`;

	if (
		oldPresence?.status !== newPresence?.status &&
		lastStatuses[user.id] !== newPresence?.status
	) {
		// Update the last status for this user
		lastStatuses[user.id] = newPresence?.status;

		// User has come online
		if (oldPresence?.status === PresenceUpdateStatus.Offline && newPresence?.status) {
			let color = "Green";
			const fields = [];

			// User has come online as idle
			if (newPresence?.status === PresenceUpdateStatus.Idle) {
				color = "Yellow";
				fields.push({
					name: "Status",
					value: PresenceUpdateStatus.Idle,
				});

				// User has come online as dnd
			} else if (newPresence?.status === PresenceUpdateStatus.DoNotDisturb) {
				color = "Red";
				fields.push({
					name: "Status",
					value: PresenceUpdateStatus.DoNotDisturb,
				});
			}

			await logUserStatusUpdate({
				// title: null,
				user,
				oldPresence,
				newPresence,
				description: `${userMentionString} has come online`,
				color: color as ColorResolvable,
				fields,
			});

			return;
		}

		// User has gone offline
		if (oldPresence?.status && newPresence?.status === PresenceUpdateStatus.Offline) {
			log(`${user.username} has gone offline`, LogType.USER_STATUS_UPDATE);

			await logUserStatusUpdate({
				user,
				oldPresence,
				newPresence,
				description: `${userMentionString} has gone offline`,
				color: "Grey",
			});
		}

		// User has gone idle
		if (
			oldPresence?.status !== PresenceUpdateStatus.Idle &&
			newPresence?.status === PresenceUpdateStatus.Idle
		) {
			log(`${user.username} has gone idle`, LogType.USER_STATUS_UPDATE);

			await logUserStatusUpdate({
				user,
				oldPresence,
				newPresence,
				description: `${userMentionString} has gone idle`,
				color: "Yellow",
			});
		}

		// User has gone on dnd
		if (
			oldPresence?.status !== PresenceUpdateStatus.DoNotDisturb &&
			newPresence?.status === PresenceUpdateStatus.DoNotDisturb
		) {
			log(`${user.username} went on DND (do not disturb)`, LogType.USER_STATUS_UPDATE);
			await logUserStatusUpdate({
				user,
				oldPresence,
				newPresence,
				description: `${userMentionString} is now on dnd (do not disturb)`,
				color: "Red",
				// fields: [
				// 	{
				// 		name: "Status",
				// 		value: newPresence.status,
				// 	},
				// ],
			});
		}
	}
};
export const handleActivityUpdate = async ({
	presence: _presence,
	activities,
	user,
}: {
	activities: Presence["activities"];
	user: User;
	presence: unknown;
}) => {
	// console.log("handleActivityUpdate", activities, user);

	if (activities.length === 0) {
		return;
	}

	for (const activity of activities) {
		const type = activityTypesMap[activity.type];

		// If the activity has not changed, skip this iteration
		if (lastActivities[user.id] === activity.details) {
			continue;
		}

		// Update the last activity for this user
		lastActivities[user.id] = activity.details;

		let details = {};
		// console.log("type", activity);

		if (type === "Listening") {
			const song = activity.details;
			const artist = activity.state?.replace(";", ",");
			const album = activity.assets?.largeText;

			log(
				`🔊 ${user.username} is listening to •• ${song} by ${artist} •• on ${activity.name}`,
				LogType.USER_ACTIVITY_UPDATE,
			);
			details = {
				song,
				artist,
				album,
			};
		} else if (type === "Custom") {
			const _custom = {
				name: "Custom Status",
				type: 4,
				url: null,
				details: activity.details,
				state: activity.state,
				applicationId: activity.applicationId,
				timestamps: {
					start: activity.timestamps?.start,
					end: activity.timestamps?.end,
				},
				party: activity.party,
				syncId: activity.syncId,
				assets: activity.assets,
				flags: activity.flags,
				emoji: activity.emoji,
				buttons: activity.buttons,
				createdTimestamp: activity.createdTimestamp,
			};
			details = {
				statusText: activity.state,
			};
		} else if (type === "Watching") {
			details = {
				video: activity.details,
			};
		} else if (type === "Playing") {
			details = {
				game: activity.details,
			};
		} else if (type === "Streaming") {
			details = {
				stream: activity.details,
				url: activity.url,
			};
		} else if (type === "Competing") {
			// Handle Competing type
		}

		// Handle activity update
		const newActivity = {
			user: user?.tag,
			name: activity.name,
			type,
			details,
			emoji: activity.emoji
				? {
						name: activity?.emoji?.name,
						id: activity?.emoji?.id,
						animated: activity?.emoji?.animated,
						url: activity?.emoji?.imageURL(),
					}
				: null,
			url: activity.url,
			createdAt: activity.createdAt,
		};

		await storeActivity({ activity: newActivity });
	}
};
