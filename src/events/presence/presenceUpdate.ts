import { Events, type Presence } from "discord.js";

import { handleActivityUpdate } from "../../lib/handlers/user";
import type { Event } from "../../lib/types/events";
import { getUserProperties } from "../../lib/util";
import { reportEventError } from "../util";

const name = Events.PresenceUpdate;

const execute = async (oldPresence: Presence, newPresence: Presence) => {
	try {
		const json = newPresence.toJSON();

		const user = getUserProperties({ userObject: newPresence.user });
		if (!user) return;

		// Check if the presence is a duplicate
		if (
			oldPresence?.status === newPresence?.status &&
			oldPresence?.activities?.length === newPresence?.activities?.length
		) {
			return;
		}

		const oldActivitiesCount = oldPresence?.activities?.length ?? 0;
		const newActivitiesCount = newPresence.activities.length;

		if (newActivitiesCount > 0 || (newActivitiesCount === 0 && oldActivitiesCount > 0)) {
			await handleActivityUpdate({
				activities: newPresence.activities, // This will be [] if activities were cleared
				user,
				presence: json,
				// oldActivities: oldPresence?.activities // Consider for future handler update
			});
		}
	} catch (error) {
		reportEventError("presenceUpdate", error, {
			userId: newPresence.user?.id,
		});
	}
};

export const presenceUpdate: Event = {
	name,
	execute,
};
