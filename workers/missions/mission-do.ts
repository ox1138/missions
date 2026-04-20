// MissionDO — one instance per mission. Owns the mission row, its threads,
// messages, research log, approvals, and activity event stream. The mission
// workflow (Phase 3) will live on this DO using this.schedule() for durable
// follow-ups. See docs/missions-prd.md § Mission lifecycle and § Data model.

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./db/mission-schema";
import type {
	MissionPhase,
	TargetStatus,
	ThreadStatus,
	ApprovalType,
	ApprovalStatus,
} from "./db/mission-schema";
import { applyMigrations } from "../durableObject/migrations";
import { missionMigrations } from "./migrations/mission";
import type { Env } from "../types";

export interface MissionRow {
	id: string;
	user_id: string;
	agent_id: string;
	brief: string;
	phase: MissionPhase;
	completion_condition: string | null;
	created_at: string;
	completed_at: string | null;
}

export interface TargetRow {
	id: string;
	mission_id: string;
	contact_id: string | null;
	name: string | null;
	email: string;
	context: string | null;
	status: TargetStatus;
}

export interface ThreadRow {
	id: string;
	mission_id: string;
	target_id: string;
	contact_id: string | null;
	subject: string | null;
	last_activity: string;
	status: ThreadStatus;
}

export interface MessageRow {
	id: string;
	thread_id: string;
	direction: "in" | "out";
	from_addr: string;
	to_addr: string;
	cc: string | null;
	subject: string | null;
	body: string;
	sent_at: string;
	message_id: string | null;
	in_reply_to: string | null;
}

export interface ApprovalRow {
	id: string;
	mission_id: string;
	thread_id: string | null;
	type: ApprovalType;
	prompt: string;
	context: string | null;
	options: string | null;
	proposed_action: string | null;
	timeout_at: string | null;
	default_behavior: "proceed" | "hold";
	status: ApprovalStatus;
	created_at: string;
	resolved_at: string | null;
	resolution: string | null;
}

export interface ActivityEventRow {
	id: string;
	mission_id: string;
	timestamp: string;
	type: string;
	description: string;
	metadata: string | null;
}

export interface ResearchLogRow {
	id: string;
	mission_id: string;
	timestamp: string;
	type: "note" | "web_fetch" | "synthesis" | "contact_check";
	content: string;
	source_url: string | null;
	related_contact_id: string | null;
}

function uuid() {
	return crypto.randomUUID();
}
function nowIso() {
	return new Date().toISOString();
}

export class MissionDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;
	db: ReturnType<typeof drizzle>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.db = drizzle(this.ctx.storage, { schema });
		applyMigrations(this.ctx.storage.sql, missionMigrations, this.ctx.storage);
	}

	// ── Mission row ─────────────────────────────────────────────────

	async createMission(input: {
		id: string;
		userId: string;
		agentId: string;
		brief: string;
		completionCondition?: unknown;
	}): Promise<MissionRow> {
		const row: MissionRow = {
			id: input.id,
			user_id: input.userId,
			agent_id: input.agentId,
			brief: input.brief,
			phase: "draft",
			completion_condition: input.completionCondition
				? JSON.stringify(input.completionCondition)
				: null,
			created_at: nowIso(),
			completed_at: null,
		};
		await this.db.insert(schema.missions).values(row);
		await this.logActivity({
			missionId: input.id,
			type: "mission.created",
			description: `Mission created: ${input.brief.slice(0, 120)}`,
		});
		return row;
	}

	async getMission(id: string): Promise<MissionRow | null> {
		const rows = await this.db
			.select()
			.from(schema.missions)
			.where(eq(schema.missions.id, id))
			.limit(1);
		return (rows[0] as MissionRow | undefined) ?? null;
	}

	async setPhase(id: string, phase: MissionPhase): Promise<void> {
		await this.db
			.update(schema.missions)
			.set({
				phase,
				completed_at:
					phase === "complete" || phase === "cancelled" ? nowIso() : null,
			})
			.where(eq(schema.missions.id, id));
		await this.logActivity({
			missionId: id,
			type: "mission.phase_changed",
			description: `phase → ${phase}`,
		});
	}

	// ── Targets ─────────────────────────────────────────────────────

	async addTarget(input: {
		missionId: string;
		email: string;
		name?: string;
		context?: unknown;
		status?: TargetStatus;
		contactId?: string;
	}): Promise<TargetRow> {
		const row: TargetRow = {
			id: uuid(),
			mission_id: input.missionId,
			contact_id: input.contactId ?? null,
			name: input.name ?? null,
			email: input.email.toLowerCase(),
			context: input.context ? JSON.stringify(input.context) : null,
			status: input.status ?? "pending",
		};
		await this.db.insert(schema.targets).values(row);
		return row;
	}

	async listTargets(missionId: string): Promise<TargetRow[]> {
		const rows = await this.db
			.select()
			.from(schema.targets)
			.where(eq(schema.targets.mission_id, missionId));
		return rows as TargetRow[];
	}

	async setTargetStatus(id: string, status: TargetStatus): Promise<void> {
		await this.db
			.update(schema.targets)
			.set({ status })
			.where(eq(schema.targets.id, id));
	}

	// ── Threads ─────────────────────────────────────────────────────

	async createThread(input: {
		missionId: string;
		targetId: string;
		contactId?: string | null;
		subject?: string;
	}): Promise<ThreadRow> {
		const row: ThreadRow = {
			id: uuid(),
			mission_id: input.missionId,
			target_id: input.targetId,
			contact_id: input.contactId ?? null,
			subject: input.subject ?? null,
			last_activity: nowIso(),
			status: "active",
		};
		await this.db.insert(schema.threads).values(row);
		return row;
	}

	async getThread(id: string): Promise<ThreadRow | null> {
		const rows = await this.db
			.select()
			.from(schema.threads)
			.where(eq(schema.threads.id, id))
			.limit(1);
		return (rows[0] as ThreadRow | undefined) ?? null;
	}

	async listThreads(missionId: string): Promise<ThreadRow[]> {
		const rows = await this.db
			.select()
			.from(schema.threads)
			.where(eq(schema.threads.mission_id, missionId))
			.orderBy(desc(schema.threads.last_activity));
		return rows as ThreadRow[];
	}

	async setThreadStatus(id: string, status: ThreadStatus): Promise<void> {
		await this.db
			.update(schema.threads)
			.set({ status, last_activity: nowIso() })
			.where(eq(schema.threads.id, id));
	}

	// ── Messages ────────────────────────────────────────────────────

	async addMessage(input: Omit<MessageRow, "id">): Promise<MessageRow> {
		const row: MessageRow = { id: uuid(), ...input };
		await this.db.insert(schema.messages).values(row);
		await this.db
			.update(schema.threads)
			.set({ last_activity: nowIso() })
			.where(eq(schema.threads.id, input.thread_id));
		return row;
	}

	async listMessages(threadId: string): Promise<MessageRow[]> {
		const rows = await this.db
			.select()
			.from(schema.messages)
			.where(eq(schema.messages.thread_id, threadId))
			.orderBy(schema.messages.sent_at);
		return rows as MessageRow[];
	}

	// ── Approvals ───────────────────────────────────────────────────

	async createApproval(
		input: Omit<ApprovalRow, "id" | "status" | "created_at" | "resolved_at" | "resolution">,
	): Promise<ApprovalRow> {
		const row: ApprovalRow = {
			id: uuid(),
			status: "pending",
			created_at: nowIso(),
			resolved_at: null,
			resolution: null,
			...input,
		};
		await this.db.insert(schema.approvals).values(row);
		await this.logActivity({
			missionId: input.mission_id,
			type: "approval.requested",
			description: input.prompt,
			metadata: { approval_id: row.id, type: input.type },
		});
		return row;
	}

	async resolveApproval(
		id: string,
		resolution: unknown,
		status: "resolved" | "expired" = "resolved",
	): Promise<void> {
		const rows = await this.db
			.select()
			.from(schema.approvals)
			.where(eq(schema.approvals.id, id))
			.limit(1);
		const approval = rows[0] as ApprovalRow | undefined;
		if (!approval) return;
		await this.db
			.update(schema.approvals)
			.set({
				status,
				resolved_at: nowIso(),
				resolution: JSON.stringify(resolution),
			})
			.where(eq(schema.approvals.id, id));
		await this.logActivity({
			missionId: approval.mission_id,
			type: "approval.resolved",
			description: `${approval.type} resolved (${status})`,
			metadata: { approval_id: id, resolution },
		});
	}

	async getApproval(id: string): Promise<ApprovalRow | null> {
		const rows = await this.db
			.select()
			.from(schema.approvals)
			.where(eq(schema.approvals.id, id))
			.limit(1);
		return (rows[0] as ApprovalRow | undefined) ?? null;
	}

	async listPendingApprovals(missionId: string): Promise<ApprovalRow[]> {
		const rows = await this.db
			.select()
			.from(schema.approvals)
			.where(
				and(
					eq(schema.approvals.mission_id, missionId),
					eq(schema.approvals.status, "pending"),
				),
			)
			.orderBy(desc(schema.approvals.created_at));
		return rows as ApprovalRow[];
	}

	// ── Research log ────────────────────────────────────────────────

	async addResearchLog(
		input: Omit<ResearchLogRow, "id" | "timestamp">,
	): Promise<ResearchLogRow> {
		const row: ResearchLogRow = { id: uuid(), timestamp: nowIso(), ...input };
		await this.db.insert(schema.research_log).values(row);
		return row;
	}

	async listResearchLog(missionId: string): Promise<ResearchLogRow[]> {
		const rows = await this.db
			.select()
			.from(schema.research_log)
			.where(eq(schema.research_log.mission_id, missionId))
			.orderBy(schema.research_log.timestamp);
		return rows as ResearchLogRow[];
	}

	// ── Activity stream ─────────────────────────────────────────────

	async logActivity(input: {
		missionId: string;
		type: string;
		description: string;
		metadata?: unknown;
	}): Promise<ActivityEventRow> {
		const row: ActivityEventRow = {
			id: uuid(),
			mission_id: input.missionId,
			timestamp: nowIso(),
			type: input.type,
			description: input.description,
			metadata: input.metadata ? JSON.stringify(input.metadata) : null,
		};
		await this.db.insert(schema.activity_events).values(row);
		return row;
	}

	async listActivity(
		missionId: string,
		limit = 200,
	): Promise<ActivityEventRow[]> {
		const rows = await this.db
			.select()
			.from(schema.activity_events)
			.where(eq(schema.activity_events.mission_id, missionId))
			.orderBy(desc(schema.activity_events.timestamp))
			.limit(limit);
		return rows as ActivityEventRow[];
	}

	// ── Scheduling (durable alarms) ─────────────────────────────────

	async scheduleTask(input: {
		missionId: string;
		kind: schema.ScheduledTaskKind;
		fireAt: Date;
		payload?: unknown;
	}): Promise<string> {
		const id = uuid();
		await this.db.insert(schema.scheduled_tasks).values({
			id,
			mission_id: input.missionId,
			kind: input.kind,
			fire_at: input.fireAt.toISOString(),
			payload: input.payload ? JSON.stringify(input.payload) : null,
			status: "pending",
			created_at: nowIso(),
			fired_at: null,
		});
		await this.syncAlarm();
		return id;
	}

	async cancelTask(id: string): Promise<void> {
		await this.db
			.update(schema.scheduled_tasks)
			.set({ status: "cancelled", fired_at: nowIso() })
			.where(eq(schema.scheduled_tasks.id, id));
		await this.syncAlarm();
	}

	private async syncAlarm(): Promise<void> {
		const rows = (await this.db
			.select()
			.from(schema.scheduled_tasks)
			.where(eq(schema.scheduled_tasks.status, "pending"))
			.orderBy(schema.scheduled_tasks.fire_at)
			.limit(1)) as Array<{ fire_at: string }>;
		const next = rows[0];
		if (!next) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		await this.ctx.storage.setAlarm(new Date(next.fire_at).getTime());
	}

	async alarm(): Promise<void> {
		const now = new Date();
		const due = (await this.db
			.select()
			.from(schema.scheduled_tasks)
			.where(eq(schema.scheduled_tasks.status, "pending"))
			.orderBy(schema.scheduled_tasks.fire_at)) as Array<{
			id: string;
			mission_id: string;
			kind: schema.ScheduledTaskKind;
			fire_at: string;
			payload: string | null;
		}>;

		const ready = due.filter((r) => new Date(r.fire_at) <= now);

		// Dynamic import to avoid the circular dep between DO class and workflow.
		const { dispatchScheduled } = await import("./workflows/mission-workflow");

		for (const task of ready) {
			try {
				await dispatchScheduled(this, this.env, {
					taskId: task.id,
					missionId: task.mission_id,
					kind: task.kind,
					payload: task.payload ? JSON.parse(task.payload) : null,
				});
			} catch (err) {
				console.error(
					`[mission-do] scheduled task ${task.kind} failed:`,
					(err as Error).message,
				);
			}
			await this.db
				.update(schema.scheduled_tasks)
				.set({ status: "done", fired_at: nowIso() })
				.where(eq(schema.scheduled_tasks.id, task.id));
		}

		await this.syncAlarm();
	}

	// ── Workflow entry points (delegated to workflow module) ────────

	async startMission(missionId: string): Promise<void> {
		const { startMission } = await import("./workflows/mission-workflow");
		await startMission(this, this.env, missionId);
	}

	async onInboundMessage(input: {
		threadId: string;
		message: Omit<MessageRow, "id" | "thread_id" | "direction">;
	}): Promise<void> {
		const { handleInbound } = await import("./workflows/mission-workflow");
		await handleInbound(this, this.env, input.threadId, input.message);
	}

	async resolveApprovalFromUser(
		approvalId: string,
		resolution: unknown,
	): Promise<void> {
		const { handleApprovalResolution } = await import(
			"./workflows/mission-workflow"
		);
		await handleApprovalResolution(this, this.env, approvalId, resolution);
	}
}
