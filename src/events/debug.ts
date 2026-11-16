import { Events } from "discord.js";
import { IS_DEV } from "../lib/constants";
import { reportEventError } from "./util";

export const debug = {
	name: Events.Debug,
	execute(info: string) {
		try {
			if (IS_DEV) {
				console.log(`[DEBUG] ${info}`);
			}
		} catch (error) {
			reportEventError("debug", error);
		}
	},
};
