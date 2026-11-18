import * as Sentry from "@sentry/bun";
import { Server } from "../types/server";
import { User } from "../types/user";

export enum LogType {
	MESSAGE_CREATE = "MESSAGE_CREATE",
	MESSAGE_UPDATE = "MESSAGE_UPDATE",
	MESSAGE_DELETE = "MESSAGE_DELETE",
	PRESENCE_UPDATE = "PRESENCE_UPDATE",
	VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE",
	USER_UPDATE = "USER_UPDATE",
	USER_STATUS_UPDATE = "USER_STATUS_UPDATE",
	USER_ACTIVITY_UPDATE = "USER_ACTIVITY_UPDATE",
	GUILD_MEMBER_UPDATE = "GUILD_MEMBER_UPDATE",
	INTERACTION_CREATE = "INTERACTION_CREATE",
	READY = "READY",
	INVITE_CREATE = "INVITE_CREATE",
	INVITE_DELETE = "INVITE_DELETE",
}

const ENABLED_LOGS = {
	[LogType.MESSAGE_CREATE]: false,
	[LogType.USER_UPDATE]: false,
	[LogType.MESSAGE_UPDATE]: false,
	[LogType.MESSAGE_DELETE]: false,
	[LogType.PRESENCE_UPDATE]: {
		all: false,
		status: false,
		activity: false,
	},
	[LogType.INVITE_CREATE]: false,
	[LogType.INVITE_DELETE]: false,
	[LogType.USER_ACTIVITY_UPDATE]: false,
	[LogType.VOICE_STATE_UPDATE]: false,
};

const properLog = (message: any) => {
	if (Array.isArray(message)) {
		return console.log(...message);
	}
	return console.log(message);
};
export const log = (message: any, type?: LogType, force = false) => {
	if (force) return properLog(message);

	switch (type) {
		case LogType.MESSAGE_CREATE:
			if (ENABLED_LOGS[LogType.MESSAGE_CREATE]) {
				properLog(message);
			}
			break;
		case LogType.USER_ACTIVITY_UPDATE:
			if (ENABLED_LOGS[LogType.PRESENCE_UPDATE].all) {
				properLog(message);
			}
			if (ENABLED_LOGS[LogType.PRESENCE_UPDATE].activity) {
				properLog(message);
			}
			break;
		case LogType.USER_STATUS_UPDATE:
			if (ENABLED_LOGS[LogType.PRESENCE_UPDATE].all) {
				properLog(message);
			}
			if (ENABLED_LOGS[LogType.PRESENCE_UPDATE].status) {
				properLog(message);
			}
			break;
		case LogType.MESSAGE_UPDATE:
			if (ENABLED_LOGS[LogType.MESSAGE_UPDATE]) {
				properLog(message);
			}
			break;
		case LogType.VOICE_STATE_UPDATE:
			if (ENABLED_LOGS[LogType.VOICE_STATE_UPDATE]) {
				properLog(message);
			}
			break;
		default:
			properLog(message);
			break;
	}
};

export function formatDate(
	dateString: string,
	opts: { short?: boolean } = {
		short: false,
	},
): string {
	const { short } = opts;
	const date = new Date(dateString);
	const options = {
		year: "numeric",
		month: short ? "short" : "long",
		day: "numeric",
	};
	const formattedDate = date.toLocaleString("en-US", options as any);

	return formattedDate;
}
export const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const getUserProperties = ({ userObject }: { userObject: any }): User => {
	return {
		tag: userObject.tag,
		id: userObject.id,
		databaseID: `user:${userObject.id}`,
		username: userObject.username,
		displayName: userObject.displayName,
		globalName: userObject.username,
		discriminator: userObject.discriminator,
		avatar: userObject.avatarURL(),
		isBot: userObject.bot,
		createdAt: String(userObject.createdAt),
	};
};
export const getServerProperties = ({ server }: { server: any }): Server => {
	if (!server) {
		const error = new Error("Cannot derive server properties from a null server instance.");

		// Report to Sentry with context
		Sentry.withScope((scope) => {
			scope.setTag("util.function", "getServerProperties");
			scope.setLevel("error");
			scope.setContext("server_context", {
				serverValue: server,
				serverType: typeof server,
			});
			Sentry.captureException(error);
		});

		// Log for visibility
		console.error("[getServerProperties] Attempted to get properties from null server", { server });

		throw error;
	}
	return {
		id: server.id,
		databaseID: `server:${server.id}`,
		name: server.name,
		banner: server?.bannerURL ? server.bannerURL() : null,
		icon: server?.iconURL ? server.iconURL() : null,
		owner: `${server.ownerId}`,
		memberCount: server.memberCount,
		joinedAt: String(server.joinedAt),
		createdAt: String(server.createdAt),
	};
};
