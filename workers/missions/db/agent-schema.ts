// Drizzle schema for AgentDO — one instance per (user_id, agent_role). Stores
// the agent's editable identity (name/voice/signature) and their Memory doc
// (about / policies / topics). See docs/missions-prd.md § Agents and § Memory.

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export type AgentRole = "mara" | "otto" | "iris";

export const agent_identity = sqliteTable("agent_identity", {
	id: text("id").primaryKey(), // matches the DO's idFromName key, e.g. "default:otto"
	user_id: text("user_id").notNull(),
	role: text("role").notNull(), // AgentRole
	name: text("name").notNull(),
	bio: text("bio"),
	voice: text("voice"),
	signature: text("signature"),
	avatar_url: text("avatar_url"),
	email_local_part: text("email_local_part").notNull(),
	updated_at: text("updated_at").notNull(),
});

// Memory is stored as one row per (user, agent), with each section as JSON text.
// Sections are small enough for this shape; we avoid per-entry rows for MVP.
export const agent_memory = sqliteTable("agent_memory", {
	id: text("id").primaryKey(),
	user_id: text("user_id").notNull(),
	about: text("about").notNull().default("[]"), // JSON: MemoryEntry[]
	policies: text("policies").notNull().default("[]"),
	topics: text("topics").notNull().default("[]"),
	updated_at: text("updated_at").notNull(),
});

export interface MemoryEntry {
	id: string;
	value: string;
	source: "seeded" | "agent" | "user";
	created_at: string;
	pinned?: boolean;
}
