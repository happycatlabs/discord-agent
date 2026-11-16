import { Collection, Events, Guild, GuildMember, REST, Routes } from "discord.js"; // Added GuildMember and Collection
import { commands } from "../../commands";
import { DEV_CLIENT_ID, DEV_TOKEN, IS_DEV, PROD_CLIENT_ID, PROD_TOKEN } from "../../lib/constants";
import { createServer } from "../../lib/db/guild";
import { createUsers } from "../../lib/db/user";
import { getServerProperties, getUserProperties } from "../../lib/util";
import { reportEventError } from "../util";

export const guildCreate = {
	name: Events.GuildCreate,
	once: false, // This event can fire multiple times
	async execute(guild: Guild) {
		try {
			console.log(`Joined new guild: ${guild.name} (${guild.id})`);

			// --- Adapt logic from init command ---

			// 1. Get server properties
			const server = getServerProperties({
				server: guild,
			});

			const deployResult = await deployCommandsToGuild({
				// Store result
				guildId: guild.id,
				clientId: IS_DEV ? DEV_CLIENT_ID! : PROD_CLIENT_ID!,
				token: IS_DEV ? DEV_TOKEN! : PROD_TOKEN!,
			});

			if (!deployResult.success) {
				console.warn(`Failed to deploy commands to guild ${guild.id}: ${deployResult.message}`);
				// Depending on severity, might decide to return or throw an error here
			}

			// 2. Call createServer
			const { success, exists } = await createServer({
				...server,
				// logChannel: ??? // Decide how to handle this
			});

			if (success || exists) {
				console.log(`Server ${guild.name} initialized/updated in DB.`);
				// 3. Fetch members and add them
				try {
					// Removed @ts-expect-error, added type for members and member
					const members: Collection<string, GuildMember> = await guild.members.fetch();
					const cleanMembers = members.map((member: GuildMember) => {
						// Typed member
						return getUserProperties({ userObject: member.user });
					});
					const { stored, updated } = await createUsers({
						users: cleanMembers,
						server, // Pass the server object obtained earlier
					});
					console.log(`Processed members for ${guild.name}: ${stored} stored, ${updated} updated.`);

					// Optionally send a welcome message to a default channel or the owner
					// This requires finding a suitable channel and checking permissions.
				} catch (memberError) {
					reportEventError(
						"guildCreate",
						memberError,
						{
							guildId: guild.id,
							phase: "fetchMembers",
						},
						"warning",
					);
				}
			} else {
				console.error(`Failed to initialize server ${guild.name} in DB.`);
			}

			// --- End adapted logic ---
		} catch (error) {
			reportEventError("guildCreate", error, {
				guildId: guild?.id,
				guildName: guild?.name,
			});
		}
	},
};

interface DeployCommandsOptions {
	guildId: string;
	clientId: string;
	token: string;
}

export async function deployCommandsToGuild({
	guildId,
	clientId,
	token,
}: DeployCommandsOptions): Promise<{ success: boolean; message: string }> {
	try {
		const rest = new REST().setToken(token);

		// Filter out dev-only commands if they exist
		const devCommands = ["dc"];
		const commandsToSend = [...commands].filter(
			(command) => !devCommands.includes(command.data.name),
		);

		// Convert commands to JSON format
		const jsonCommands = commandsToSend.map((command) => command.data.toJSON());

		// Deploy commands to the specific guild
		await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
			body: jsonCommands,
		});

		return {
			success: true,
			message: `Successfully deployed ${jsonCommands.length} commands to guild ${guildId}`,
		};
	} catch (error) {
		console.error("Error deploying commands:", error);
		return {
			success: false,
			message: `Failed to deploy commands: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
