import * as Sentry from "@sentry/node";
import {
	type AutocompleteInteraction,
	ChannelType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type GuildTextBasedChannel,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import {
	addReactionRoleMapping,
	createReactionRoleMessage,
	deleteReactionRoleMessage,
	getAllMappingsForMessage,
	getReactionRoleMessage,
	getReactionRoleMessagesForServer,
	removeReactionRoleMapping,
} from "../../../lib/db/reaction-roles";

export const reactionRoles = {
	data: new SlashCommandBuilder()
		.setName("reactionroles")
		.setDescription("Manage reaction role messages")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("create")
				.setDescription("Create a new reaction role message")
				.addStringOption((option) =>
					option
						.setName("name")
						.setDescription("A short name to identify this setup (e.g. 'Color Roles')")
						.setRequired(true),
				)
				.addChannelOption((option) =>
					option
						.setName("channel")
						.setDescription("Channel to post the message in")
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("message")
						.setDescription("The message content to display")
						.setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("mode")
						.setDescription("Toggle (normal) or mutually exclusive (unique)")
						.setRequired(true)
						.addChoices(
							{ name: "Normal (Toggle)", value: "normal" },
							{ name: "Unique (Mutually Exclusive)", value: "unique" },
						),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("add")
				.setDescription("Add an emoji-role mapping to a reaction role message")
				.addStringOption((option) =>
					option
						.setName("message_id")
						.setDescription("Select a reaction role message")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option
						.setName("emoji")
						.setDescription("The emoji to use (paste the emoji)")
						.setRequired(true),
				)
				.addRoleOption((option) =>
					option.setName("role").setDescription("The role to assign").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("remove")
				.setDescription("Remove an emoji-role mapping")
				.addStringOption((option) =>
					option
						.setName("message_id")
						.setDescription("Select a reaction role message")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option.setName("emoji").setDescription("The emoji to remove").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("edit")
				.setDescription("Edit the text of a reaction role message")
				.addStringOption((option) =>
					option
						.setName("message_id")
						.setDescription("Select a reaction role message")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addStringOption((option) =>
					option.setName("new_message").setDescription("The new message content").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand.setName("list").setDescription("List all reaction role setups in this server"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("delete")
				.setDescription("Delete a reaction role setup")
				.addStringOption((option) =>
					option
						.setName("message_id")
						.setDescription("Select a reaction role message")
						.setRequired(true)
						.setAutocomplete(true),
				),
		),

	async autocomplete(interaction: AutocompleteInteraction) {
		const focusedOption = interaction.options.getFocused(true);

		if (focusedOption.name === "message_id") {
			const guildId = interaction.guild?.id;
			if (!guildId) return interaction.respond([]);

			const messages = getReactionRoleMessagesForServer({ serverId: guildId });
			const choices = messages.map((msg) => ({
				name: `${msg.name} (${msg.mode})`,
				value: msg.id,
			}));

			// Filter by what user has typed
			const filtered = choices.filter(
				(choice) =>
					choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
					choice.value.includes(focusedOption.value),
			);

			await interaction.respond(filtered.slice(0, 25));
		}
	},

	async execute(interaction: ChatInputCommandInteraction) {
		const subcommand = interaction.options.getSubcommand();

		try {
			switch (subcommand) {
				case "create":
					return handleCreate(interaction);
				case "add":
					return handleAdd(interaction);
				case "remove":
					return handleRemove(interaction);
				case "edit":
					return handleEdit(interaction);
				case "list":
					return handleList(interaction);
				case "delete":
					return handleDelete(interaction);
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error(`Error executing reactionroles ${subcommand}:`, error);
			const content = "An error occurred while processing your request.";
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content, flags: [MessageFlags.Ephemeral] });
			} else {
				await interaction.reply({ content, flags: [MessageFlags.Ephemeral] });
			}
			throw error;
		}
	},
};

async function handleCreate(interaction: ChatInputCommandInteraction) {
	const name = interaction.options.getString("name", true);
	const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
	const messageContent = interaction.options.getString("message", true);
	const mode = interaction.options.getString("mode", true) as "normal" | "unique";

	if (!interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Send the message to the channel
	const sentMessage = await channel.send(messageContent);

	// Store in database
	const success = createReactionRoleMessage({
		messageId: sentMessage.id,
		serverId: interaction.guild.id,
		channelId: channel.id,
		name,
		mode,
		createdBy: interaction.user.id,
	});

	if (!success) {
		await sentMessage.delete();
		await interaction.reply({
			content: "Failed to create reaction role message. Please try again.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle("Reaction Role Message Created")
		.setDescription(
			`**${name}** posted in <#${channel.id}>\n\n**Mode:** ${mode === "normal" ? "Normal (Toggle)" : "Unique (Mutually Exclusive)"}\n\nUse \`/reactionroles add\` to add emoji-role mappings.`,
		);

	await interaction.reply({ embeds: [embed] });
}

async function handleAdd(interaction: ChatInputCommandInteraction) {
	const messageId = interaction.options.getString("message_id", true);
	const emojiInput = interaction.options.getString("emoji", true);
	const role = interaction.options.getRole("role", true);

	if (!interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Verify the message exists in our database
	const reactionRoleMsg = getReactionRoleMessage({ messageId });
	if (!reactionRoleMsg) {
		await interaction.reply({
			content:
				"That message is not a reaction role message. Create one first with `/reactionroles create`.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Check role hierarchy - bot must be able to assign this role
	const botMember = await interaction.guild.members.fetchMe();
	if (role.position >= botMember.roles.highest.position) {
		await interaction.reply({
			content: "I cannot manage this role - it is equal to or higher than my highest role.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Parse emoji - could be unicode or custom emoji
	let emoji: string;
	let emojiName: string | undefined;

	// Check for custom emoji format: <:name:id> or <a:name:id>
	const customEmojiMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
	if (customEmojiMatch) {
		emoji = customEmojiMatch[2]; // Use the ID
		emojiName = customEmojiMatch[1];
	} else {
		// Unicode emoji - use as-is
		emoji = emojiInput.trim();
		emojiName = undefined;
	}

	// Add mapping to database
	const success = addReactionRoleMapping({
		messageId,
		emoji,
		emojiName,
		roleId: role.id,
	});

	if (!success) {
		await interaction.reply({
			content:
				"Failed to add the mapping. The emoji or role may already be mapped to this message.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Add the reaction to the message
	let reactionAdded = false;
	let reactionError = "";
	try {
		const channel = await interaction.guild.channels.fetch(reactionRoleMsg.channel_id);
		if (channel?.isTextBased()) {
			const message = await channel.messages.fetch(messageId);
			// For custom emojis use "name:id" format, for unicode use as-is
			const emojiToReact = customEmojiMatch
				? `${customEmojiMatch[1]}:${customEmojiMatch[2]}`
				: emojiInput.trim();
			await message.react(emojiToReact);
			reactionAdded = true;
		}
	} catch (error) {
		console.log(`Could not add reaction to message: ${String(error)}`);
		reactionError = String(error);
	}

	const embed = new EmbedBuilder()
		.setColor(reactionAdded ? 0x00ff00 : 0xff9900)
		.setDescription(
			`Added mapping: ${emojiInput} → <@&${role.id}>${reactionAdded ? "" : `\n\n⚠️ Could not add reaction automatically: ${reactionError}`}`,
		);

	await interaction.reply({ embeds: [embed] });
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
	const messageId = interaction.options.getString("message_id", true);
	const emojiInput = interaction.options.getString("emoji", true);

	if (!interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Verify the message exists
	const reactionRoleMsg = getReactionRoleMessage({ messageId });
	if (!reactionRoleMsg) {
		await interaction.reply({
			content: "That message is not a reaction role message.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Parse emoji
	let emoji: string;
	const customEmojiMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
	if (customEmojiMatch) {
		emoji = customEmojiMatch[2];
	} else {
		emoji = emojiInput.trim();
	}

	const success = removeReactionRoleMapping({ messageId, emoji });

	if (!success) {
		await interaction.reply({
			content: "Failed to remove the mapping.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Remove bot's reaction from the message
	try {
		const channel = await interaction.guild.channels.fetch(reactionRoleMsg.channel_id);
		if (channel?.isTextBased()) {
			const message = await channel.messages.fetch(messageId);
			const reaction = message.reactions.cache.find((r) => (r.emoji.id || r.emoji.name) === emoji);
			if (reaction) {
				await reaction.users.remove(interaction.client.user?.id);
			}
		}
	} catch (error) {
		console.log(`Could not remove reaction from message: ${String(error)}`);
	}

	const embed = new EmbedBuilder()
		.setColor(0xff9900)
		.setDescription(`Removed mapping for ${emojiInput}`);

	await interaction.reply({ embeds: [embed] });
}

async function handleEdit(interaction: ChatInputCommandInteraction) {
	const messageId = interaction.options.getString("message_id", true);
	const newContent = interaction.options.getString("new_message", true);

	if (!interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	const reactionRoleMsg = getReactionRoleMessage({ messageId });
	if (!reactionRoleMsg) {
		await interaction.reply({
			content: "That message is not a reaction role message.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	try {
		const channel = await interaction.guild.channels.fetch(reactionRoleMsg.channel_id);
		if (channel?.isTextBased()) {
			const message = await channel.messages.fetch(messageId);
			await message.edit(newContent);

			const embed = new EmbedBuilder()
				.setColor(0x00ff00)
				.setDescription("Message updated successfully.");

			await interaction.reply({ embeds: [embed] });
		} else {
			await interaction.reply({
				content: "Could not find the channel.",
				flags: [MessageFlags.Ephemeral],
			});
		}
	} catch (error) {
		console.log(`Could not edit message: ${String(error)}`);
		await interaction.reply({
			content: `Failed to edit message: ${String(error)}`,
			flags: [MessageFlags.Ephemeral],
		});
	}
}

async function handleList(interaction: ChatInputCommandInteraction) {
	if (!interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	const messages = getReactionRoleMessagesForServer({
		serverId: interaction.guild.id,
	});

	if (messages.length === 0) {
		await interaction.reply({
			content:
				"No reaction role messages set up in this server. Use `/reactionroles create` to create one.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	const embed = new EmbedBuilder().setColor(0x0099ff).setTitle("Reaction Role Messages");

	let description = "";
	for (const msg of messages) {
		const mappings = getAllMappingsForMessage({ messageId: msg.id });
		const mappingStr =
			mappings.length > 0
				? mappings
						.map((m) => {
							const emojiDisplay = m.emoji_name ? `<:${m.emoji_name}:${m.emoji}>` : m.emoji;
							return `${emojiDisplay} → <@&${m.role_id}>`;
						})
						.join(", ")
				: "No mappings";

		description +=
			`**${msg.name}**\n` +
			`Channel: <#${msg.channel_id}> • Mode: ${msg.mode === "normal" ? "Normal" : "Unique"}\n` +
			`Mappings: ${mappingStr}\n\n`;
	}

	embed.setDescription(description.trim());
	await interaction.reply({ embeds: [embed] });
}

async function handleDelete(interaction: ChatInputCommandInteraction) {
	const messageId = interaction.options.getString("message_id", true);

	if (!interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	const reactionRoleMsg = getReactionRoleMessage({ messageId });
	if (!reactionRoleMsg) {
		await interaction.reply({
			content: "That message is not a reaction role message.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Delete from database (cascades to mappings)
	const success = deleteReactionRoleMessage({ messageId });

	if (!success) {
		await interaction.reply({
			content: "Failed to delete the reaction role setup.",
			flags: [MessageFlags.Ephemeral],
		});
		return;
	}

	// Optionally delete the Discord message too
	try {
		const channel = await interaction.guild.channels.fetch(reactionRoleMsg.channel_id);
		if (channel?.isTextBased()) {
			const message = await channel.messages.fetch(messageId);
			await message.delete();
		}
	} catch (error) {
		console.log(`Could not delete Discord message: ${String(error)}`);
		// Non-fatal - database record is deleted
	}

	const embed = new EmbedBuilder()
		.setColor(0xff0000)
		.setDescription("Reaction role setup deleted.");

	await interaction.reply({ embeds: [embed] });
}
