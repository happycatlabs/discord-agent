import { AuditLogEvent, Events, type Guild, type GuildAuditLogsEntry } from "discord.js"; // Added AuditLogEvent
import { handleBan, handleKick, handleUnban } from "../../lib/handlers/guild";
// Removed sleep import as it's no longer used
import { reportEventError } from "../util";

const name = Events.GuildAuditLogEntryCreate;

async function execute(auditLogEntry: GuildAuditLogsEntry, guild: Guild) {
	// Renamed auditLog to auditLogEntry
	try {
		// sleep(500) was removed
		switch (auditLogEntry.action) {
			case AuditLogEvent.MemberKick:
				await handleKick({ auditLog: auditLogEntry, guild });
				break;
			case AuditLogEvent.MemberBanAdd:
				await handleBan({ auditLog: auditLogEntry, guild });
				break;
			case AuditLogEvent.MemberBanRemove:
				await handleUnban({ auditLog: auditLogEntry, guild });
				break;
			default:
				// Optional: console.log(`Audit log action ${auditLogEntry.action} not handled for entry ${auditLogEntry.id} in guild ${guild.name}`);
				break;
		}
	} catch (error) {
		reportEventError("guildAuditLogEntryCreate", error, {
			auditLogEntryId: auditLogEntry.id,
			guildId: guild.id,
			action: auditLogEntry.action,
		});
	}
}

export const guildAuditLogEntryCreate = { name, execute };
