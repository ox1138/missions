// UserDO — one instance per user (single-user MVP uses key "default").
// Owns: the user row, all Contacts, Contact_activity log.
// See docs/missions-prd.md § Data model and § Contacts.

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "./db/user-schema";
import type { ContactOutcome, ContactStatus } from "./db/user-schema";
import { applyMigrations } from "../durableObject/migrations";
import { userMigrations } from "./migrations/user";
import type { Env } from "../types";

export interface ContactRow {
	id: string;
	user_id: string;
	email: string;
	name: string | null;
	role_context: string | null;
	first_seen_at: string;
	last_interaction_at: string;
	total_interactions: number;
	last_outcome: string | null;
	status: ContactStatus;
	notes: string | null;
	updated_at: string;
}

export interface ContactActivityRow {
	id: string;
	contact_id: string;
	mission_id: string | null;
	agent_id: string;
	timestamp: string;
	type: string;
	summary: string | null;
	metadata: string | null;
}

export interface RecordInteractionInput {
	userId: string;
	agentId: string;
	missionId?: string | null;
	email: string;
	name?: string;
	roleContext?: string;
	type: schema.ContactActivityType;
	summary?: string;
	metadata?: Record<string, unknown>;
	outcome?: ContactOutcome;
}

function uuid() {
	return crypto.randomUUID();
}
function nowIso() {
	return new Date().toISOString();
}

// 24 lowercase hex chars = 12 random bytes = 96 bits of entropy. We use hex
// (not base64url) because email addresses are case-insensitive at delivery
// time — Gmail and most MTAs lowercase the local-part, so mixed-case
// base64url tokens get mangled by the time they hit our inbound handler.
function randomToken(): string {
	const bytes = new Uint8Array(12);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export class UserDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;
	db: ReturnType<typeof drizzle>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.db = drizzle(this.ctx.storage, { schema });
		applyMigrations(this.ctx.storage.sql, userMigrations, this.ctx.storage);
	}

	async ensureUser(input: {
		userId: string;
		email: string;
		name?: string;
		domain: string;
	}): Promise<void> {
		const existing = await this.db
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, input.userId))
			.limit(1);
		if (existing.length > 0) return;
		await this.db.insert(schema.users).values({
			id: input.userId,
			email: input.email,
			name: input.name ?? null,
			domain: input.domain,
			created_at: nowIso(),
		});
	}

	async getUser(
		userId: string,
	): Promise<{
		id: string;
		email: string;
		name: string | null;
		domain: string;
		created_at: string;
	} | null> {
		const rows = await this.db
			.select()
			.from(schema.users)
			.where(eq(schema.users.id, userId))
			.limit(1);
		return (rows[0] as
			| {
					id: string;
					email: string;
					name: string | null;
					domain: string;
					created_at: string;
			  }
			| undefined) ?? null;
	}

	async getContactByEmail(
		userId: string,
		email: string,
	): Promise<ContactRow | null> {
		const rows = await this.db
			.select()
			.from(schema.contacts)
			.where(
				and(
					eq(schema.contacts.user_id, userId),
					eq(schema.contacts.email, email.toLowerCase()),
				),
			)
			.limit(1);
		return (rows[0] as ContactRow | undefined) ?? null;
	}

	async recordInteraction(input: RecordInteractionInput): Promise<ContactRow> {
		const email = input.email.toLowerCase();
		const now = nowIso();
		let contact = await this.getContactByEmail(input.userId, email);

		if (!contact) {
			const id = uuid();
			await this.db.insert(schema.contacts).values({
				id,
				user_id: input.userId,
				email,
				name: input.name ?? null,
				role_context: input.roleContext ?? null,
				first_seen_at: now,
				last_interaction_at: now,
				total_interactions: 1,
				last_outcome: input.outcome ?? null,
				status: "active",
				notes: null,
				updated_at: now,
			});
			contact = (await this.getContactByEmail(input.userId, email))!;
		} else {
			await this.db
				.update(schema.contacts)
				.set({
					last_interaction_at: now,
					total_interactions: contact.total_interactions + 1,
					last_outcome: input.outcome ?? contact.last_outcome,
					name: input.name ?? contact.name,
					role_context: input.roleContext ?? contact.role_context,
					updated_at: now,
				})
				.where(eq(schema.contacts.id, contact.id));
			contact = (await this.getContactByEmail(input.userId, email))!;
		}

		await this.db.insert(schema.contact_activity).values({
			id: uuid(),
			contact_id: contact.id,
			mission_id: input.missionId ?? null,
			agent_id: input.agentId,
			timestamp: now,
			type: input.type,
			summary: input.summary ?? null,
			metadata: input.metadata ? JSON.stringify(input.metadata) : null,
		});

		return contact;
	}

	async getContactHistory(
		userId: string,
		email: string,
	): Promise<{ contact: ContactRow; activity: ContactActivityRow[] } | null> {
		const contact = await this.getContactByEmail(userId, email);
		if (!contact) return null;
		const activity = (await this.db
			.select()
			.from(schema.contact_activity)
			.where(eq(schema.contact_activity.contact_id, contact.id))
			.orderBy(
				desc(schema.contact_activity.timestamp),
			)) as ContactActivityRow[];
		return { contact, activity };
	}

	async isSuppressed(userId: string, email: string): Promise<boolean> {
		const c = await this.getContactByEmail(userId, email);
		return c?.status === "suppressed";
	}

	async suppress(userId: string, email: string): Promise<void> {
		await this.db
			.update(schema.contacts)
			.set({ status: "suppressed", updated_at: nowIso() })
			.where(
				and(
					eq(schema.contacts.user_id, userId),
					eq(schema.contacts.email, email.toLowerCase()),
				),
			);
	}

	async setOutcome(
		userId: string,
		email: string,
		outcome: ContactOutcome,
	): Promise<void> {
		await this.db
			.update(schema.contacts)
			.set({ last_outcome: outcome, updated_at: nowIso() })
			.where(
				and(
					eq(schema.contacts.user_id, userId),
					eq(schema.contacts.email, email.toLowerCase()),
				),
			);
	}

	// ── Reply tokens ───────────────────────────────────────────────
	// Short opaque keys used in the reply-to local part. We keep them
	// short (16 chars → ~96 bits of entropy) so the full reply-to stays
	// under the 64-octet RFC 5321 local-part limit. Guessability isn't a
	// concern — even if an attacker lands on a valid token they only
	// inject a message into that specific thread.

	async createReplyToken(input: {
		missionId: string;
		threadId: string;
		targetId?: string | null;
	}): Promise<string> {
		const token = randomToken();
		await this.db.insert(schema.reply_tokens).values({
			token,
			mission_id: input.missionId,
			thread_id: input.threadId,
			target_id: input.targetId ?? null,
			created_at: nowIso(),
		});
		return token;
	}

	async resolveReplyToken(
		token: string,
	): Promise<{
		missionId: string;
		threadId: string;
		targetId: string | null;
	} | null> {
		// Normalize case — inbound email local-parts are lowercased by most
		// MTAs, and we store hex which is already lowercase.
		const normalized = token.toLowerCase();
		const rows = await this.db
			.select()
			.from(schema.reply_tokens)
			.where(eq(schema.reply_tokens.token, normalized))
			.limit(1);
		const row = rows[0] as
			| { mission_id: string; thread_id: string; target_id: string | null }
			| undefined;
		if (!row) return null;
		return {
			missionId: row.mission_id,
			threadId: row.thread_id,
			targetId: row.target_id,
		};
	}

	async listContacts(
		userId: string,
		filter?: { status?: ContactStatus },
	): Promise<ContactRow[]> {
		const conditions = [eq(schema.contacts.user_id, userId)];
		if (filter?.status) {
			conditions.push(eq(schema.contacts.status, filter.status));
		}
		const rows = await this.db
			.select()
			.from(schema.contacts)
			.where(and(...conditions))
			.orderBy(desc(schema.contacts.last_interaction_at));
		return rows as ContactRow[];
	}
}
