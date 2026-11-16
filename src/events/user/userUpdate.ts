import { EmbedBuilder, Events, type User } from "discord.js";
import { getServersForUser } from "../../lib/db/user";
import { LogCategory, sendMessageToLogChannel } from "../../lib/util/logging";
import { reportEventError } from "../util";

const handleGlobalAvatarChange = async (oldUser: User, newUser: User) => {
	// const user = await getUserFromDb({ id: newUser.id }); // Removed redundant DB call
	const userServers = await getServersForUser({ userId: newUser.id });

	if (oldUser.avatar !== newUser.avatar) {
		console.log(`Global avatar update: ${newUser.tag} (${newUser.avatarURL()})`);

		if (userServers) {
			for (const serverId of userServers) {
				// Send message to log channel
				const embed = new EmbedBuilder()
					.setColor("Purple")
					.setTitle("Global avatar update")

					.setAuthor({
						name: newUser.username,
						iconURL: newUser.avatarURL() as string,
					});

				if (newUser.avatar) {
					embed.setDescription(`<@${newUser.id}> updated their avatar.`);
					const avatarUrl = newUser.avatarURL({ size: 1024 });
					if (avatarUrl) embed.setImage(avatarUrl);
				} else {
					embed.setDescription(`<@${newUser.id}> removed their avatar.`);
				}

				try {
					void sendMessageToLogChannel({
						serverId,
						embed,
						event: newUser,
						category: LogCategory.MEMBERS,
					});
				} catch (error) {
					reportEventError(
						"userUpdate",
						error,
						{
							serverId,
							userId: newUser.id,
							phase: "sendMessageToLogChannel",
						},
						"warning",
					);
				}
			}
		}
	}
};

const handleBannerChange = async (oldUser: User, newUser: User) => {
	if (oldUser.banner === newUser.banner) {
		return;
	}

	const userServers = await getServersForUser({ userId: newUser.id });

	console.log(`Banner update: ${newUser.tag} (${newUser.bannerURL()})`);

	if (userServers) {
		for (const serverId of userServers) {
			const embed = new EmbedBuilder()
				.setColor("Purple")
				.setTitle("Banner update")
				.setAuthor({
					name: newUser.username,
					iconURL: newUser.avatarURL() as string,
				});

			if (newUser.banner) {
				embed.setDescription(`<@${newUser.id}> updated their banner.`);
				const bannerUrl = newUser.bannerURL({ size: 1024 });
				if (bannerUrl) embed.setImage(bannerUrl);
			} else {
				embed.setDescription(`<@${newUser.id}> removed their banner.`);
			}

			try {
				void sendMessageToLogChannel({
					serverId,
					embed,
					event: newUser,
					category: LogCategory.MEMBERS,
				});
			} catch (error) {
				reportEventError(
					"userUpdate",
					error,
					{
						serverId,
						userId: newUser.id,
						phase: "handleBannerChange",
					},
					"warning",
				);
			}
		}
	}
};

export const userUpdate = {
	name: Events.UserUpdate,
	async execute(oldUser: User, newUser: User) {
		try {
			await handleGlobalAvatarChange(oldUser, newUser);
			await handleBannerChange(oldUser, newUser);
		} catch (error) {
			reportEventError("userUpdate", error, { userId: newUser?.id });
		}
	},
};
