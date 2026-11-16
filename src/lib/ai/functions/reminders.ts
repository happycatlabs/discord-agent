export enum ReminderFunction {
	CREATE_REMINDER = "CREATE_REMINDER",
	REMIND_ME = "REMIND_ME",
	REMIND_USER = "REMIND_USER",
}

export const reminderFunctions = [
	{
		type: "function",
		function: {
			name: ReminderFunction.CREATE_REMINDER,
			description:
				"Use this function if the user is asking you to remind them about something. Their message might look like, 'remind me to do something in 5 minutes' or 'remind me to do something at 5pm', 'I need a reminder for the tournament tomorrow at 12pm' etc.",
			parameters: {
				type: "object",
				properties: {
					userId: {
						description: "The ID of the user to create the reminder for.",
						type: "string",
					},
					message: {
						description:
							"The thing the user wants to be reminded about. This will get passed to an AI to determine the date and time for the reminder.",
						type: "string",
					},
				},
				required: ["userId", "message"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReminderFunction.REMIND_ME,
			description:
				"Use this function if the user is asking you to remind them about something. Their message might look like, 'remind me to do something in 5 minutes' or 'remind me to do something at 5pm', 'I need a reminder for the tournament tomorrow at 12pm' etc.",
			parameters: {
				type: "object",
				properties: {
					userId: {
						description: "The ID of the user to create the reminder for.",
						type: "string",
					},
					message: {
						description:
							"The thing the user wants to be reminded about. This will get passed to an AI to determine the date and time for the reminder.",
						type: "string",
					},
				},
				required: ["userId", "message"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: ReminderFunction.REMIND_USER,
			description:
				"Use this function if the user is asking you to remind them about something. Their message might look like, 'remind me to do something in 5 minutes' or 'remind me to do something at 5pm', 'I need a reminder for the tournament tomorrow at 12pm' etc.",
			parameters: {
				type: "object",
				properties: {
					userId: {
						description: "The ID of the user to create the reminder for.",
						type: "string",
					},
					message: {
						description:
							"The thing the user wants to be reminded about. This will get passed to an AI to determine the date and time for the reminder.",
						type: "string",
					},
				},
				required: ["userId", "message"],
			},
		},
	},
];
