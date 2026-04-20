// AgentDO — one instance per (user_id, agent_role). Holds the agent's
// editable identity (name, voice, signature, bio, avatar) and their Memory
// document. Keyed by idFromName("{user_id}:{role}"), e.g. "default:otto".
// See docs/missions-prd.md § Agents and § Memory.

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { eq } from "drizzle-orm";
import * as schema from "./db/agent-schema";
import type { AgentRole, MemoryEntry } from "./db/agent-schema";
import { applyMigrations } from "../durableObject/migrations";
import { agentMigrations } from "./migrations/agent";
import type { Env } from "../types";

export interface AgentIdentity {
	id: string;
	user_id: string;
	role: AgentRole;
	name: string;
	bio: string | null;
	voice: string | null;
	signature: string | null;
	avatar_url: string | null;
	email_local_part: string;
	updated_at: string;
}

export interface AgentMemory {
	about: MemoryEntry[];
	policies: MemoryEntry[];
	topics: MemoryEntry[];
	updated_at: string;
}

export const AGENT_DEFAULTS: Record<AgentRole, Omit<AgentIdentity, "id" | "user_id" | "updated_at">> = {
	otto: {
		role: "otto",
		name: "Otto",
		bio: "Correspondent. Writes to real people, handles replies, introduces you warmly when a thread is ready.",
		voice: "Warm but efficient. Short sentences. Comfortable asking clarifying questions. Never performs deference.",
		signature: "— Otto",
		avatar_url: null,
		email_local_part: "otto",
	},
	mara: {
		role: "mara",
		name: "Mara",
		bio: "Researcher. Reads the web, synthesizes briefs. Does not email third parties.",
		voice: "Precise, compressed, slightly dry. Findings first, methodology in footnotes.",
		signature: "— Mara",
		avatar_url: null,
		email_local_part: "mara",
	},
	iris: {
		role: "iris",
		name: "Iris",
		bio: "Watcher. Monitors signals on the web and tells you when something changes.",
		voice: "Minimal. One or two lines per update. No embellishment.",
		signature: "— Iris",
		avatar_url: null,
		email_local_part: "iris",
	},
};

function nowIso() {
	return new Date().toISOString();
}

export class AgentDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;
	db: ReturnType<typeof drizzle>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.db = drizzle(this.ctx.storage, { schema });
		applyMigrations(this.ctx.storage.sql, agentMigrations, this.ctx.storage);
	}

	async ensureIdentity(input: {
		id: string;
		userId: string;
		role: AgentRole;
	}): Promise<AgentIdentity> {
		const existing = await this.db
			.select()
			.from(schema.agent_identity)
			.where(eq(schema.agent_identity.id, input.id))
			.limit(1);
		if (existing.length > 0) {
			return existing[0] as AgentIdentity;
		}
		const defaults = AGENT_DEFAULTS[input.role];
		const row = {
			id: input.id,
			user_id: input.userId,
			role: input.role,
			name: defaults.name,
			bio: defaults.bio,
			voice: defaults.voice,
			signature: defaults.signature,
			avatar_url: defaults.avatar_url,
			email_local_part: defaults.email_local_part,
			updated_at: nowIso(),
		};
		await this.db.insert(schema.agent_identity).values(row);
		// Seed empty memory row too
		await this.db.insert(schema.agent_memory).values({
			id: input.id,
			user_id: input.userId,
			about: "[]",
			policies: "[]",
			topics: "[]",
			updated_at: nowIso(),
		});
		return row as AgentIdentity;
	}

	async getIdentity(id: string): Promise<AgentIdentity | null> {
		const rows = await this.db
			.select()
			.from(schema.agent_identity)
			.where(eq(schema.agent_identity.id, id))
			.limit(1);
		return (rows[0] as AgentIdentity | undefined) ?? null;
	}

	async updateIdentity(
		id: string,
		patch: Partial<Omit<AgentIdentity, "id" | "user_id" | "role" | "updated_at">>,
	): Promise<AgentIdentity | null> {
		await this.db
			.update(schema.agent_identity)
			.set({ ...patch, updated_at: nowIso() })
			.where(eq(schema.agent_identity.id, id));
		return this.getIdentity(id);
	}

	async getMemory(id: string): Promise<AgentMemory | null> {
		const rows = await this.db
			.select()
			.from(schema.agent_memory)
			.where(eq(schema.agent_memory.id, id))
			.limit(1);
		const row = rows[0];
		if (!row) return null;
		return {
			about: JSON.parse(row.about) as MemoryEntry[],
			policies: JSON.parse(row.policies) as MemoryEntry[],
			topics: JSON.parse(row.topics) as MemoryEntry[],
			updated_at: row.updated_at,
		};
	}

	async updateMemory(
		id: string,
		patch: Partial<Pick<AgentMemory, "about" | "policies" | "topics">>,
	): Promise<AgentMemory | null> {
		const current = await this.getMemory(id);
		if (!current) return null;
		const next = {
			about: patch.about ?? current.about,
			policies: patch.policies ?? current.policies,
			topics: patch.topics ?? current.topics,
		};
		await this.db
			.update(schema.agent_memory)
			.set({
				about: JSON.stringify(next.about),
				policies: JSON.stringify(next.policies),
				topics: JSON.stringify(next.topics),
				updated_at: nowIso(),
			})
			.where(eq(schema.agent_memory.id, id));
		return this.getMemory(id);
	}
}
