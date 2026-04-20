import type { Migration } from "../../durableObject/migrations";

export const missionMigrations: Migration[] = [
	{
		name: "1_initial_mission_tables",
		sql: `
			CREATE TABLE missions (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				agent_id TEXT NOT NULL,
				brief TEXT NOT NULL,
				phase TEXT NOT NULL DEFAULT 'draft',
				completion_condition TEXT,
				created_at TEXT NOT NULL,
				completed_at TEXT
			);

			CREATE TABLE research_log (
				id TEXT PRIMARY KEY,
				mission_id TEXT NOT NULL,
				timestamp TEXT NOT NULL,
				type TEXT NOT NULL,
				content TEXT NOT NULL,
				source_url TEXT,
				related_contact_id TEXT
			);
			CREATE INDEX idx_research_log_mission ON research_log(mission_id);

			CREATE TABLE targets (
				id TEXT PRIMARY KEY,
				mission_id TEXT NOT NULL,
				contact_id TEXT,
				name TEXT,
				email TEXT NOT NULL,
				context TEXT,
				status TEXT NOT NULL DEFAULT 'pending'
			);
			CREATE INDEX idx_targets_mission ON targets(mission_id);

			CREATE TABLE threads (
				id TEXT PRIMARY KEY,
				mission_id TEXT NOT NULL,
				target_id TEXT NOT NULL,
				contact_id TEXT,
				subject TEXT,
				last_activity TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'active'
			);
			CREATE INDEX idx_threads_mission ON threads(mission_id);
			CREATE INDEX idx_threads_target ON threads(target_id);

			CREATE TABLE messages (
				id TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL,
				direction TEXT NOT NULL,
				from_addr TEXT NOT NULL,
				to_addr TEXT NOT NULL,
				cc TEXT,
				subject TEXT,
				body TEXT NOT NULL,
				sent_at TEXT NOT NULL,
				message_id TEXT,
				in_reply_to TEXT
			);
			CREATE INDEX idx_messages_thread ON messages(thread_id);

			CREATE TABLE approvals (
				id TEXT PRIMARY KEY,
				mission_id TEXT NOT NULL,
				thread_id TEXT,
				type TEXT NOT NULL,
				prompt TEXT NOT NULL,
				context TEXT,
				options TEXT,
				proposed_action TEXT,
				timeout_at TEXT,
				default_behavior TEXT NOT NULL DEFAULT 'hold',
				status TEXT NOT NULL DEFAULT 'pending',
				created_at TEXT NOT NULL,
				resolved_at TEXT,
				resolution TEXT
			);
			CREATE INDEX idx_approvals_mission ON approvals(mission_id);
			CREATE INDEX idx_approvals_status ON approvals(status);

			CREATE TABLE activity_events (
				id TEXT PRIMARY KEY,
				mission_id TEXT NOT NULL,
				timestamp TEXT NOT NULL,
				type TEXT NOT NULL,
				description TEXT NOT NULL,
				metadata TEXT
			);
			CREATE INDEX idx_activity_mission ON activity_events(mission_id);
		`,
	},
];
