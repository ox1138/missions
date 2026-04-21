// Drizzle schema for UserDO — stores the single user row, global contacts,
// and the timestamped contact_activity log. See docs/missions-prd.md § Data model.

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull(),
	name: text("name"),
	domain: text("domain").notNull(),
	created_at: text("created_at").notNull(),
	role: text("role"),
	bio: text("bio"),
});

export type ContactOutcome =
	| "positive"
	| "negative"
	| "ghosted"
	| "booked"
	| "active"
	| "declined";
export type ContactStatus = "active" | "suppressed";

export const contacts = sqliteTable(
	"contacts",
	{
		id: text("id").primaryKey(),
		user_id: text("user_id").notNull(),
		email: text("email").notNull(),
		name: text("name"),
		role_context: text("role_context"),
		first_seen_at: text("first_seen_at").notNull(),
		last_interaction_at: text("last_interaction_at").notNull(),
		total_interactions: integer("total_interactions").notNull().default(0),
		last_outcome: text("last_outcome"),
		status: text("status").notNull().default("active"),
		notes: text("notes"),
		updated_at: text("updated_at").notNull(),
	},
	(t) => [
		index("idx_contacts_user_email").on(t.user_id, t.email),
		index("idx_contacts_status").on(t.status),
	],
);

export type ContactActivityType =
	| "email_sent"
	| "email_received"
	| "researched"
	| "monitored"
	| "noted"
	| "outcome_set";

// Short opaque tokens used in reply-to addresses (reply+<token>@domain).
// Kept short to stay under RFC 5321's 64-octet local-part limit — CF's
// Email Service validator rejects long local-parts silently with a 500.
export const reply_tokens = sqliteTable("reply_tokens", {
	token: text("token").primaryKey(),
	mission_id: text("mission_id").notNull(),
	thread_id: text("thread_id").notNull(),
	target_id: text("target_id"),
	created_at: text("created_at").notNull(),
});

export const contact_activity = sqliteTable(
	"contact_activity",
	{
		id: text("id").primaryKey(),
		contact_id: text("contact_id")
			.notNull()
			.references(() => contacts.id, { onDelete: "cascade" }),
		mission_id: text("mission_id"),
		agent_id: text("agent_id").notNull(),
		timestamp: text("timestamp").notNull(),
		type: text("type").notNull(),
		summary: text("summary"),
		metadata: text("metadata"),
	},
	(t) => [
		index("idx_activity_contact").on(t.contact_id),
		index("idx_activity_mission").on(t.mission_id),
	],
);
