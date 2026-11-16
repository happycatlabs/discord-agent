import { randomUUID } from "node:crypto";
import chalk from "chalk";

import { all, normalizeId, run } from ".";
import { chat } from "../util/openai";

interface Reminder {
	id: string;
	user: string;
	when: string;
	message: string;
}

type ReminderRow = {
	id: string;
	user_id: string;
	message: string;
	when: string;
	deleted: number;
	created_at: string;
	updated_at: string | null;
};

const mapRowToReminder = (row: ReminderRow): Reminder => ({
	id: row.id,
	user: row.user_id,
	when: row.when,
	message: row.message,
});

// Create reminder
export const createReminder = async ({ userId, message }: { userId: string; message: string }) => {
	const userKey = normalizeId(userId);

	const now = new Date().toISOString();

	const { response, error } = await chat({
		messages: [
			{
				role: "system",
				content: `The user wants to create a reminder. Your job is to take what they say and return a date string (valid ISOString) for the \`when\`, which is the reminder date. The difference should be relative to the curernt date and time (${new Date().toISOString()})`,
			},
			{
				role: "user",
				content: message,
			},
			{
				role: "system",
				content: `The current date and time is ${new Date().toISOString()}. Return only JSON for the \`when\` and the \`message\` (the message you will send to the user when it's time).`,
			},
		],
		json: true,
		userId,
	});

	if (error) {
		console.log({ error });
		return;
	}

	let reminder: Reminder | null = null;

	// Attempt to parse the response from OpenAI into a JSON object
	// There are better ways to do this
	try {
		const parsed = JSON.parse(response as string);
		reminder = parsed;

		console.log(
			chalk.white(
				"⏰ New reminder",
				chalk.blueBright(
					JSON.stringify(
						{
							user: userKey,
							now,
							when: new Date(parsed.when),
						},
						null,
						2,
					),
				),
			),
		);
	} catch (error) {
		console.log("Error parsing response from OpenAI:", error);
		return;
	}

	if (!reminder?.when || !reminder?.message) {
		console.log("Invalid reminder payload returned from AI", reminder);
		return;
	}

	const reminderId = randomUUID();
	const whenIso = new Date(reminder.when).toISOString();

	run(
		`INSERT INTO reminders (id, user_id, message, "when", deleted, created_at)
		 VALUES (?1, ?2, ?3, ?4, 0, ?5)`,
		[reminderId, userKey, reminder.message, whenIso, now],
	);

	const newReminder: Reminder = {
		id: reminderId,
		user: userKey,
		when: whenIso,
		message: reminder.message,
	};

	void scheduleReminder(newReminder).then(() => {
		console.log(
			chalk.green(
				`\nScheduled reminder for ${newReminder.when} with message: ${newReminder.message}`,
			),
		);
	});

	return newReminder;
};

export const getRemindersForUser = async (userId: string) => {
	return all<ReminderRow>("SELECT * FROM reminders WHERE user_id = ?1 AND deleted = 0", [
		normalizeId(userId),
	]).map(mapRowToReminder);
};

export const deleteReminder = async (id: string) => {
	run("UPDATE reminders SET deleted = 1, updated_at = ?2 WHERE id = ?1", [
		id,
		new Date().toISOString(),
	]);
};

const scheduleReminder = async (reminder: Reminder) => {
	try {
		const { when, message, id } = reminder;

		const now = new Date().toISOString();
		const reminderDate = new Date(when);

		// Delete expired reminders

		if (reminderDate < new Date(now)) {
			await deleteReminder(id);
		} else {
			const timeDifference = reminderDate.getTime() - new Date().getTime();

			setTimeout(() => {
				console.log(chalk.redBright(`\n⏰ ${message}\n`));

				void deleteReminder(reminder.id);
			}, timeDifference);
		}
	} catch (error) {
		console.log("Error scheduling reminder:", error);
	}
};

export const scheduleReminders = async () => {
	const reminders = all<ReminderRow>("SELECT * FROM reminders WHERE deleted = 0");

	let count = 0;
	for (const reminder of reminders.map(mapRowToReminder)) {
		void scheduleReminder(reminder);
		count++;
	}

	if (count > 0) {
		console.log(
			chalk.bold(`⏰ Reminders: ${count > 0 ? chalk.blue(count) : chalk.red(count)} scheduled`),
		);
	}
};

// export const handleNewReminders = async () => {
// 	const reminders = await db.query(
// 		"live select * from reminder where deleted = false",
// 	);

// 	console.log({ liveReminders: reminders });

// 	for (const reminder of reminders) {
// 		const { when, reminder: message, id } = reminder;

// 		const now = new Date().toISOString();
// 		const reminderDate = new Date(when);

// 		if (reminderDate < new Date(now)) {
// 			await deleteReminder(id);
// 		} else {
// 			const timeDifference = reminderDate.getTime() - new Date(now).getTime();
// 			console.log(`Setting up timer for ${id} in ${timeDifference}ms`);
// 			setTimeout(async () => {
// 				console.log("Time to remind:", message);
// 				await deleteReminder(id);
// 			}, timeDifference);
// 		}
// 	}
// };
