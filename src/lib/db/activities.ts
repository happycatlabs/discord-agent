import { normalizeId, run } from ".";

import { LogType, log } from "../util";

export const storeActivity = async ({ activity }: { activity: any }) => {
	try {
		const createdAt = activity?.createdAt
			? new Date(activity.createdAt).toISOString()
			: new Date().toISOString();

		run(
			`INSERT INTO activities (user_id, type, name, created_at, payload_json)
			 VALUES (?1, ?2, ?3, ?4, ?5)`,
			[
				normalizeId(activity?.user),
				activity?.type ?? null,
				activity?.name ?? null,
				createdAt,
				JSON.stringify(activity ?? {}),
			],
		);

		if (activity?.type !== "Listening") {
			log(`🧸 Stored activity, ${activity.user} on ${activity.name}`, LogType.USER_ACTIVITY_UPDATE);
		}
	} catch (error) {
		console.error("An error occurred while storing activity:", error);
	}
};
