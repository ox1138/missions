// Missions API client — thin wrapper over /api/v1/missions routes.

const API = "/api/v1/missions";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		...opts,
		headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(
			(body as { error?: string }).error ?? `Missions API ${res.status}`,
		);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

// ── Shared shapes ────────────────────────────────────────────────────

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

export type AgentRole = "otto" | "mara" | "iris";

export interface User {
	id: string;
	email: string;
	name: string | null;
	domain: string;
	created_at: string;
	role: string | null;
	bio: string | null;
}

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

export interface MemoryEntry {
	id: string;
	value: string;
	source: "seeded" | "agent" | "user";
	created_at: string;
	pinned?: boolean;
}

export interface AgentMemory {
	about: MemoryEntry[];
	policies: MemoryEntry[];
	topics: MemoryEntry[];
	updated_at: string;
}

export interface Mission {
	id: string;
	user_id: string;
	agent_id: string;
	brief: string;
	phase: MissionPhase;
	completion_condition: string | null;
	created_at: string;
	completed_at: string | null;
	answer_summary: string | null;
	answered_at: string | null;
}

export interface MissionSummary {
	mission: Mission;
	emails_sent: number;
	replies_received: number;
	thread_count: number;
}

export interface Thread {
	id: string;
	mission_id: string;
	target_id: string;
	contact_id: string | null;
	subject: string | null;
	last_activity: string;
	status: "active" | "awaiting" | "human" | "booked" | "declined" | "parked";
}

export interface Target {
	id: string;
	mission_id: string;
	contact_id: string | null;
	name: string | null;
	email: string;
	context: string | null;
	status: string;
}

export interface Message {
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

export interface TimelineMessage extends Message {
	thread_subject: string | null;
	thread_status: string;
	target_email: string | null;
	target_name: string | null;
}

export interface Approval {
	id: string;
	mission_id: string;
	thread_id: string | null;
	type: "silent_confirm" | "freeform" | "multi_choice";
	prompt: string;
	context: string | null;
	options: string | null;
	proposed_action: string | null;
	timeout_at: string | null;
	default_behavior: "proceed" | "hold";
	status: "pending" | "resolved" | "expired";
	created_at: string;
	resolved_at: string | null;
	resolution: string | null;
}

export interface ActivityEvent {
	id: string;
	mission_id: string;
	timestamp: string;
	type: string;
	description: string;
	metadata: string | null;
}

export interface Contact {
	id: string;
	user_id: string;
	email: string;
	name: string | null;
	role_context: string | null;
	first_seen_at: string;
	last_interaction_at: string;
	total_interactions: number;
	last_outcome: string | null;
	status: "active" | "suppressed";
	notes: string | null;
	updated_at: string;
}

// ── API ──────────────────────────────────────────────────────────────

export const missionsApi = {
	bootstrap: (input: { email: string; name?: string; domain: string }) =>
		request<{ ok: boolean; user: User | null }>("/bootstrap", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	me: () => request<{ user: User | null }>("/me"),
	updateMe: (patch: { name?: string | null; role?: string | null; bio?: string | null }) =>
		request<{ user: User | null }>("/me", {
			method: "PATCH",
			body: JSON.stringify(patch),
		}),

	// Agents
	listAgents: () => request<{ agents: AgentIdentity[] }>("/agents"),
	getAgent: (role: AgentRole) =>
		request<{ identity: AgentIdentity; memory: AgentMemory | null }>(
			`/agents/${role}`,
		),
	updateAgent: (role: AgentRole, patch: Partial<AgentIdentity>) =>
		request<{ identity: AgentIdentity }>(`/agents/${role}`, {
			method: "PATCH",
			body: JSON.stringify(patch),
		}),
	updateAgentMemory: (role: AgentRole, patch: Partial<AgentMemory>) =>
		request<{ memory: AgentMemory }>(`/agents/${role}/memory`, {
			method: "PATCH",
			body: JSON.stringify(patch),
		}),

	// Missions
	createMission: (input: {
		brief: string;
		agent_role: AgentRole;
		preseeded_targets?: { name: string; email: string; context: string }[];
		force_outreach?: boolean;
	}) =>
		request<{ mission_id: string }>("/missions", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	listMissions: (ids: string[]) =>
		request<{ missions: MissionSummary[] }>(
			`/missions?ids=${encodeURIComponent(ids.join(","))}`,
		),
	getMission: (id: string) =>
		request<{
			mission: Mission;
			threads: Thread[];
			targets: Target[];
			pending_approvals: Approval[];
		}>(`/missions/${id}`),
	getActivity: (id: string, limit = 200) =>
		request<{ events: ActivityEvent[] }>(
			`/missions/${id}/activity?limit=${limit}`,
		),
	getMissionMessages: (id: string) =>
		request<{ messages: TimelineMessage[] }>(`/missions/${id}/messages`),
	getResearchLog: (id: string) =>
		request<{ entries: { id: string; timestamp: string; type: string; content: string; source_url: string | null; related_contact_id: string | null }[] }>(
			`/missions/${id}/research-log`,
		),
	getThread: (missionId: string, threadId: string) =>
		request<{ thread: Thread; messages: Message[] }>(
			`/missions/${missionId}/threads/${threadId}`,
		),
	takeOver: (missionId: string, threadId: string) =>
		request<{ ok: boolean }>(
			`/missions/${missionId}/threads/${threadId}/take-over`,
			{ method: "POST" },
		),
	resolveApproval: (
		missionId: string,
		approvalId: string,
		resolution: unknown,
	) =>
		request<{ ok: boolean }>(
			`/missions/${missionId}/approvals/${approvalId}/resolve`,
			{ method: "POST", body: JSON.stringify(resolution) },
		),
	pauseMission: (id: string) =>
		request<{ ok: boolean }>(`/missions/${id}/pause`, { method: "POST" }),
	resumeMission: (id: string) =>
		request<{ ok: boolean }>(`/missions/${id}/resume`, { method: "POST" }),
	cancelMission: (id: string) =>
		request<{ ok: boolean }>(`/missions/${id}/cancel`, { method: "POST" }),
	updateMissionBrief: (id: string, brief: string) =>
		request<{ mission: Mission }>(`/missions/${id}`, {
			method: "PATCH",
			body: JSON.stringify({ brief }),
		}),
	deleteMission: (id: string) =>
		request<{ ok: boolean }>(`/missions/${id}`, { method: "DELETE" }),

	// Contacts
	listContacts: () => request<{ contacts: Contact[] }>("/contacts"),
	getContact: (email: string) =>
		request<{
			contact: Contact;
			activity: {
				id: string;
				contact_id: string;
				mission_id: string | null;
				agent_id: string;
				timestamp: string;
				type: string;
				summary: string | null;
				metadata: string | null;
			}[];
		}>(`/contacts/${encodeURIComponent(email)}`),
	suppressContact: (email: string) =>
		request<{ ok: boolean }>(
			`/contacts/${encodeURIComponent(email)}/suppress`,
			{ method: "POST" },
		),
	setContactOutcome: (email: string, outcome: string) =>
		request<{ ok: boolean }>(
			`/contacts/${encodeURIComponent(email)}/outcome`,
			{ method: "POST", body: JSON.stringify({ outcome }) },
		),
};

// ── Client-side mission ID index ────────────────────────────────────
// Since MVP has no cross-DO index, the UI keeps a list of mission IDs in
// localStorage. Small but pragmatic.

const STORAGE_KEY = "missions.ids";

export function getStoredMissionIds(): string[] {
	if (typeof window === "undefined") return [];
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
	} catch {
		return [];
	}
}
export function rememberMissionId(id: string) {
	if (typeof window === "undefined") return;
	const ids = getStoredMissionIds();
	if (!ids.includes(id)) {
		ids.unshift(id);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
	}
}
