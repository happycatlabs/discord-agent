import { all, get, normalizeId, run } from "./index";

export interface VoiceSession {
	id: number;
	server_id: string;
	user_id: string;
	channel_id: string;
	joined_at: string;
	left_at: string | null;
	duration_seconds: number | null;
	created_at: string;
}

// Start a voice session (user joins channel)
export const startVoiceSession = ({
	serverId,
	userId,
	channelId,
}: {
	serverId: string;
	userId: string;
	channelId: string;
}): number => {
	const now = new Date().toISOString();
	const result = run(
		`INSERT INTO voice_sessions (server_id, user_id, channel_id, joined_at)
		VALUES (?1, ?2, ?3, ?4)`,
		[normalizeId(serverId), normalizeId(userId), normalizeId(channelId), now],
	);
	return Number(result.lastInsertRowid);
};

// End a voice session (user leaves channel)
export const endVoiceSession = ({
	serverId,
	userId,
	channelId,
}: {
	serverId: string;
	userId: string;
	channelId?: string;
}): number | null => {
	const now = new Date().toISOString();

	// Find the active session (no left_at)
	let session: VoiceSession | undefined;
	if (channelId) {
		session = get<VoiceSession>(
			`SELECT * FROM voice_sessions
			WHERE server_id = ?1 AND user_id = ?2 AND channel_id = ?3 AND left_at IS NULL
			ORDER BY joined_at DESC LIMIT 1`,
			[normalizeId(serverId), normalizeId(userId), normalizeId(channelId)],
		);
	} else {
		session = get<VoiceSession>(
			`SELECT * FROM voice_sessions
			WHERE server_id = ?1 AND user_id = ?2 AND left_at IS NULL
			ORDER BY joined_at DESC LIMIT 1`,
			[normalizeId(serverId), normalizeId(userId)],
		);
	}

	if (!session) return null;

	// Calculate duration
	const joinedAt = new Date(session.joined_at);
	const leftAt = new Date(now);
	const durationSeconds = Math.floor((leftAt.getTime() - joinedAt.getTime()) / 1000);

	run(
		`UPDATE voice_sessions
		SET left_at = ?2, duration_seconds = ?3
		WHERE id = ?1`,
		[session.id, now, durationSeconds],
	);
	return durationSeconds;
};

// End all active sessions for a user (e.g., bot restart)
export const endAllActiveSessions = ({
	serverId,
	userId,
}: {
	serverId: string;
	userId: string;
}): void => {
	const now = new Date().toISOString();

	// Get all active sessions
	const sessions = all<VoiceSession>(
		`SELECT * FROM voice_sessions
		WHERE server_id = ?1 AND user_id = ?2 AND left_at IS NULL`,
		[normalizeId(serverId), normalizeId(userId)],
	);

	for (const session of sessions) {
		const joinedAt = new Date(session.joined_at);
		const leftAt = new Date(now);
		const durationSeconds = Math.floor((leftAt.getTime() - joinedAt.getTime()) / 1000);

		run(
			`UPDATE voice_sessions
			SET left_at = ?2, duration_seconds = ?3
			WHERE id = ?1`,
			[session.id, now, durationSeconds],
		);
	}
};

// Get active session for a user
export const getActiveVoiceSession = ({
	serverId,
	userId,
}: {
	serverId: string;
	userId: string;
}): VoiceSession | undefined => {
	return get<VoiceSession>(
		`SELECT * FROM voice_sessions
		WHERE server_id = ?1 AND user_id = ?2 AND left_at IS NULL
		ORDER BY joined_at DESC LIMIT 1`,
		[normalizeId(serverId), normalizeId(userId)],
	);
};

// Get total voice minutes for a user in a time range
export const getVoiceMinutes = ({
	serverId,
	userId,
	startDate,
	endDate,
}: {
	serverId: string;
	userId: string;
	startDate: string;
	endDate: string;
}): number => {
	const result = get<{ total_seconds: number }>(
		`SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds
		FROM voice_sessions
		WHERE server_id = ?1 AND user_id = ?2
		AND joined_at >= ?3 AND joined_at < ?4
		AND duration_seconds IS NOT NULL`,
		[normalizeId(serverId), normalizeId(userId), startDate, endDate],
	);

	return Math.floor((result?.total_seconds ?? 0) / 60);
};

// Get voice session history for a user
export const getVoiceSessionHistory = ({
	serverId,
	userId,
	limit = 10,
}: {
	serverId: string;
	userId: string;
	limit?: number;
}): VoiceSession[] => {
	return all<VoiceSession>(
		`SELECT * FROM voice_sessions
		WHERE server_id = ?1 AND user_id = ?2 AND duration_seconds IS NOT NULL
		ORDER BY joined_at DESC
		LIMIT ?3`,
		[normalizeId(serverId), normalizeId(userId), limit],
	);
};

// Get voice leaderboard for a time range
export const getVoiceLeaderboard = ({
	serverId,
	startDate,
	endDate,
	limit = 10,
}: {
	serverId: string;
	startDate: string;
	endDate: string;
	limit?: number;
}): { user_id: string; total_minutes: number }[] => {
	return all<{ user_id: string; total_minutes: number }>(
		`SELECT user_id, SUM(duration_seconds) / 60 as total_minutes
		FROM voice_sessions
		WHERE server_id = ?1
		AND joined_at >= ?2 AND joined_at < ?3
		AND duration_seconds IS NOT NULL
		GROUP BY user_id
		ORDER BY total_minutes DESC
		LIMIT ?4`,
		[normalizeId(serverId), startDate, endDate, limit],
	);
};
