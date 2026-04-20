// Drizzle schema for MissionDO — one DO instance per mission_id. Owns the
// mission, its threads/messages, its research log, pending approvals, and the
// full activity event stream. See docs/missions-prd.md § Data model.

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export type MissionPhase =
	| "draft"
	| "understand"
	| "research"
	| "awaiting-approval"
	| "outreach"
	| "monitoring"
	| "handoff"
	| "complete"
	| "paused"
	| "cancelled";

export const missions = sqliteTable("missions", {
	id: text("id").primaryKey(),
	user_id: text("user_id").notNull(),
	agent_id: text("agent_id").notNull(), // e.g. "default:otto"
	brief: text("brief").notNull(),
	phase: text("phase").notNull().default("draft"),
	completion_condition: text("completion_condition"), // JSON
	created_at: text("created_at").notNull(),
	completed_at: text("completed_at"),
});

export const research_log = sqliteTable(
	"research_log",
	{
		id: text("id").primaryKey(),
		mission_id: text("mission_id").notNull(),
		timestamp: text("timestamp").notNull(),
		type: text("type").notNull(), // note | web_fetch | synthesis | contact_check
		content: text("content").notNull(),
		source_url: text("source_url"),
		related_contact_id: text("related_contact_id"),
	},
	(t) => [index("idx_research_log_mission").on(t.mission_id)],
);

export type TargetStatus =
	| "pending"
	| "contacted"
	| "replied"
	| "booked"
	| "declined"
	| "parked"
	| "human"
	| "skipped_prior_history";

export const targets = sqliteTable(
	"targets",
	{
		id: text("id").primaryKey(),
		mission_id: text("mission_id").notNull(),
		contact_id: text("contact_id"), // null until first interaction creates Contact
		name: text("name"),
		email: text("email").notNull(),
		context: text("context"), // JSON: why this target, role, source
		status: text("status").notNull().default("pending"),
	},
	(t) => [index("idx_targets_mission").on(t.mission_id)],
);

export type ThreadStatus =
	| "active"
	| "awaiting"
	| "human"
	| "booked"
	| "declined"
	| "parked";

export const threads = sqliteTable(
	"threads",
	{
		id: text("id").primaryKey(),
		mission_id: text("mission_id").notNull(),
		target_id: text("target_id").notNull(),
		contact_id: text("contact_id"),
		subject: text("subject"),
		last_activity: text("last_activity").notNull(),
		status: text("status").notNull().default("active"),
	},
	(t) => [
		index("idx_threads_mission").on(t.mission_id),
		index("idx_threads_target").on(t.target_id),
	],
);

export const messages = sqliteTable(
	"messages",
	{
		id: text("id").primaryKey(),
		thread_id: text("thread_id").notNull(),
		direction: text("direction").notNull(), // in | out
		from_addr: text("from_addr").notNull(),
		to_addr: text("to_addr").notNull(),
		cc: text("cc"),
		subject: text("subject"),
		body: text("body").notNull(),
		sent_at: text("sent_at").notNull(),
		message_id: text("message_id"),
		in_reply_to: text("in_reply_to"),
	},
	(t) => [index("idx_messages_thread").on(t.thread_id)],
);

export type ApprovalType = "silent_confirm" | "freeform" | "multi_choice";
export type ApprovalStatus = "pending" | "resolved" | "expired";

export const approvals = sqliteTable(
	"approvals",
	{
		id: text("id").primaryKey(),
		mission_id: text("mission_id").notNull(),
		thread_id: text("thread_id"),
		type: text("type").notNull(),
		prompt: text("prompt").notNull(),
		context: text("context"), // JSON
		options: text("options"), // JSON (multi_choice)
		proposed_action: text("proposed_action"), // JSON (silent_confirm)
		timeout_at: text("timeout_at"),
		default_behavior: text("default_behavior").notNull().default("hold"), // proceed | hold
		status: text("status").notNull().default("pending"),
		created_at: text("created_at").notNull(),
		resolved_at: text("resolved_at"),
		resolution: text("resolution"), // JSON
	},
	(t) => [
		index("idx_approvals_mission").on(t.mission_id),
		index("idx_approvals_status").on(t.status),
	],
);

export const activity_events = sqliteTable(
	"activity_events",
	{
		id: text("id").primaryKey(),
		mission_id: text("mission_id").notNull(),
		timestamp: text("timestamp").notNull(),
		type: text("type").notNull(),
		description: text("description").notNull(),
		metadata: text("metadata"), // JSON
	},
	(t) => [index("idx_activity_mission").on(t.mission_id)],
);

export type ScheduledTaskKind =
	| "silent_confirm_timeout"
	| "followup_send"
	| "handoff_reminder";

export const scheduled_tasks = sqliteTable(
	"scheduled_tasks",
	{
		id: text("id").primaryKey(),
		mission_id: text("mission_id").notNull(),
		kind: text("kind").notNull(),
		fire_at: text("fire_at").notNull(),
		payload: text("payload"),
		status: text("status").notNull().default("pending"),
		created_at: text("created_at").notNull(),
		fired_at: text("fired_at"),
	},
	(t) => [index("idx_scheduled_status_fire").on(t.status, t.fire_at)],
);
