import type { Migration } from "../../durableObject/migrations";

export const agentMigrations: Migration[] = [
	{
		name: "1_initial_agent_identity_memory",
		sql: `
			CREATE TABLE agent_identity (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				role TEXT NOT NULL,
				name TEXT NOT NULL,
				bio TEXT,
				voice TEXT,
				signature TEXT,
				avatar_url TEXT,
				email_local_part TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE agent_memory (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				about TEXT NOT NULL DEFAULT '[]',
				policies TEXT NOT NULL DEFAULT '[]',
				topics TEXT NOT NULL DEFAULT '[]',
				updated_at TEXT NOT NULL
			);
		`,
	},
];
