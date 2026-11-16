import type { Event } from "../lib/types/events";

import { inviteCreate } from "./guild/inviteCreate";
import { inviteDelete } from "./guild/inviteDelete";
import { interactionCreate } from "./interaction/interactionCreate";
import { messageCreate } from "./message/messageCreate";
import { messageReactionAdd } from "./message/messageReactionAdd";
import { messageUpdate } from "./message/messageUpdate";
import { presenceUpdate } from "./presence/presenceUpdate";

import { DEBUG } from "../lib/constants/flags";
import { channelCreate } from "./channel/channelCreate";
import { channelDelete } from "./channel/channelDelete";
import { voiceStateUpdate } from "./channel/voiceStateUpdate";
import { debug } from "./debug";
import { guildAuditLogEntryCreate } from "./guild/guildAuditLogEntryCreate";
import { guildCreate } from "./guild/guildCreate";
import { guildMemberAdd } from "./guild/guildMemberAdd";
import { guildMemberRemove } from "./guild/guildMemberRemove";
import { guildMemberUpdate } from "./guild/guildMemberUpdate";
import { messageDelete } from "./message/messageDelete";
import { messageReactionRemove } from "./message/messageReactionRemove";
import { ready } from "./ready";
import { shardDisconnect } from "./shardDisconnect";
import { shardReconnecting } from "./shardReconnecting";
import { shardResume } from "./shardResume";
import { userUpdate } from "./user/userUpdate";
import { warn } from "./warn";

const messageEvents = [
	messageCreate,
	messageUpdate,
	messageDelete,
	messageReactionAdd,
	messageReactionRemove,
];
const channelEvents = [voiceStateUpdate, channelCreate, channelDelete];

const presenceEvents = [presenceUpdate];
const interactionEvents = [interactionCreate];
const serverEvents = [
	inviteCreate,
	inviteDelete,
	guildMemberAdd,
	guildMemberRemove,
	guildAuditLogEntryCreate,
	guildCreate,
];
const userEvents = [guildMemberUpdate, userUpdate];
const lifecycleEvents = [shardDisconnect, shardReconnecting, shardResume, warn];

export const events: Event[] = [
	ready,
	...interactionEvents,
	...messageEvents,
	...channelEvents,
	...presenceEvents,
	...serverEvents,
	...userEvents,
	...lifecycleEvents,
	...(DEBUG ? [debug] : []),
];
