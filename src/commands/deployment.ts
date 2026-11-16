import { ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { commands } from ".";

const DEV_ONLY_COMMAND_NAMES = new Set(["dc"]);
const DM_COMMAND_NAMES = new Set(["avatar", "banner", "img"]);

type CommandJson = {
	name: string;
	contexts?: InteractionContextType[] | null;
	integration_types?: ApplicationIntegrationType[] | null;
	[key: string]: unknown;
};

function toCommandJson(command: (typeof commands)[number]): CommandJson {
	return command.data.toJSON();
}

function withCommandAvailability(command: CommandJson, contexts: InteractionContextType[]) {
	return {
		...command,
		contexts,
		integration_types: [
			ApplicationIntegrationType.GuildInstall,
			ApplicationIntegrationType.UserInstall,
		],
	};
}

export function buildProductionGlobalCommands() {
	return commands
		.filter((command) => !DEV_ONLY_COMMAND_NAMES.has(command.data.name))
		.map(toCommandJson)
		.map((command) =>
			withCommandAvailability(
				command,
				DM_COMMAND_NAMES.has(command.name)
					? [
							InteractionContextType.Guild,
							InteractionContextType.BotDM,
							InteractionContextType.PrivateChannel,
						]
					: [InteractionContextType.Guild],
			),
		);
}

export function buildDevelopmentGuildCommands() {
	return commands.map(toCommandJson);
}

export function buildDevelopmentGlobalCommands() {
	return commands
		.map(toCommandJson)
		.filter((command) => DM_COMMAND_NAMES.has(command.name))
		.map((command) =>
			withCommandAvailability(command, [
				InteractionContextType.BotDM,
				InteractionContextType.PrivateChannel,
			]),
		);
}
