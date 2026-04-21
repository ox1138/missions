import type { Migration } from "../../durableObject/migrations";

export const userMigrations: Migration[] = [
	{
		name: "1_initial_user_contacts",
		sql: `
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				name TEXT,
				domain TEXT NOT NULL,
				created_at TEXT NOT NULL
			);

			CREATE TABLE contacts (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				email TEXT NOT NULL,
				name TEXT,
				role_context TEXT,
				first_seen_at TEXT NOT NULL,
				last_interaction_at TEXT NOT NULL,
				total_interactions INTEGER NOT NULL DEFAULT 0,
				last_outcome TEXT,
				status TEXT NOT NULL DEFAULT 'active',
				notes TEXT,
				updated_at TEXT NOT NULL
			);
			CREATE UNIQUE INDEX idx_contacts_user_email ON contacts(user_id, email);
			CREATE INDEX idx_contacts_status ON contacts(status);

			CREATE TABLE contact_activity (
				id TEXT PRIMARY KEY,
				contact_id TEXT NOT NULL,
				mission_id TEXT,
				agent_id TEXT NOT NULL,
				timestamp TEXT NOT NULL,
				type TEXT NOT NULL,
				summary TEXT,
				metadata TEXT,
				FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
			);
			CREATE INDEX idx_activity_contact ON contact_activity(contact_id);
			CREATE INDEX idx_activity_mission ON contact_activity(mission_id);
		`,
	},
	{
		name: "2_reply_tokens",
		sql: `
			CREATE TABLE reply_tokens (
				token TEXT PRIMARY KEY,
				mission_id TEXT NOT NULL,
				thread_id TEXT NOT NULL,
				target_id TEXT,
				created_at TEXT NOT NULL
			);
			CREATE INDEX idx_reply_tokens_mission ON reply_tokens(mission_id);
		`,
	},
];
