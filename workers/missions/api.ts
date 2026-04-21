// HTTP API surface for the Missions layer. Mounted at /api/v1/missions
// alongside the inherited mailbox API. The UI (Phase 6) consumes these
// endpoints; the existing CF Access JWT middleware still protects them.

import { Hono } from "hono";
import type { Env } from "../types";
import { DEFAULT_USER_ID, agentDoKey } from "./index";
import type { AgentRole } from "./db/agent-schema";
import { ensureBootstrapped } from "./services/bootstrap";
import {
	handleInboundWebhook,
	type InboundWebhookPayload,
} from "./services/email-in";
import {
	listContacts,
	suppressContact,
	setContactOutcome,
	getContactHistory,
} from "./services/contact-ingest";

export const missionsApp = new Hono<{ Bindings: Env }>();

// ── Helpers ──────────────────────────────────────────────────────────

function missionStub(env: Env, missionId: string) {
	return env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
}
function userStub(env: Env) {
	return env.USER_DO.get(env.USER_DO.idFromName(DEFAULT_USER_ID));
}
function agentStub(env: Env, role: AgentRole) {
	const id = agentDoKey(DEFAULT_USER_ID, role);
	return { stub: env.AGENT_DO.get(env.AGENT_DO.idFromName(id)), id };
}

// ── Diagnostics: minimal direct-send test ───────────────────────────
// Hits env.EMAIL.send() with the smallest possible payload to isolate
// whether the CF Email Service binding is healthy for this account.
// Bypasses the workflow, prompts, HMAC routing — just the raw binding.
// Usage: curl -X POST https://<worker>/api/v1/missions/test-send \
//         -H "Content-Type: application/json" \
//         -d '{"to":"you@example.com","from":"otto@yourdomain.com"}'

missionsApp.post("/test-send", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as {
		to?: string;
		from?: string;
	};
	const to = body.to;
	const from = body.from;
	if (!to || !from) {
		return c.json({ error: "to and from required" }, 400);
	}
	if (!c.env.EMAIL) {
		return c.json({ error: "EMAIL binding not present" }, 500);
	}
	try {
		const payload = {
			to,
			from,
			subject: "Missions test send",
			text: "This is a diagnostic test from the Missions worker.",
			html: "<p>This is a diagnostic test from the Missions worker.</p>",
		} as Parameters<SendEmail["send"]>[0];
		const result = await c.env.EMAIL.send(payload);
		return c.json({ ok: true, result });
	} catch (err) {
		const e = err as Error & { code?: string; details?: unknown };
		return c.json(
			{
				ok: false,
				message: e.message,
				code: e.code,
				details: e.details,
				obj: JSON.parse(JSON.stringify(e)),
			},
			500,
		);
	}
});

// ── Inbound webhook ─────────────────────────────────────────────────
// Provider-agnostic entry point for inbound replies. Any inbound-email
// provider (Postmark, CloudMailin, Mailgun, etc.) can be configured to
// POST here — map their payload fields to { from, to, subject, text } in
// their dashboard. The route expects a shared secret in the
// X-Inbound-Secret header matching env.HMAC_SECRET so randos can't forge
// replies. The reply+TOKEN@ pattern still has to verify separately.

missionsApp.post("/inbound", async (c) => {
	const secret = c.req.header("x-inbound-secret");
	if (!secret || secret !== c.env.HMAC_SECRET) {
		return c.json({ error: "unauthorized" }, 401);
	}
	const payload = (await c.req.json()) as InboundWebhookPayload;
	const result = await handleInboundWebhook(c.env, payload);
	return c.json(result);
});

// ── Bootstrap ────────────────────────────────────────────────────────

missionsApp.post("/bootstrap", async (c) => {
	const body = await c.req.json<{
		email: string;
		name?: string;
		domain: string;
	}>();
	await ensureBootstrapped(c.env, body);
	const user = await userStub(c.env).getUser(DEFAULT_USER_ID);
	return c.json({ ok: true, user });
});

missionsApp.get("/me", async (c) => {
	const user = await userStub(c.env).getUser(DEFAULT_USER_ID);
	return c.json({ user });
});

// ── Agents ───────────────────────────────────────────────────────────

missionsApp.get("/agents", async (c) => {
	const roles: AgentRole[] = ["otto", "mara", "iris"];
	const agents = await Promise.all(
		roles.map(async (role) => {
			const { stub, id } = agentStub(c.env, role);
			const identity = await stub.getIdentity(id);
			return identity;
		}),
	);
	return c.json({ agents: agents.filter(Boolean) });
});

missionsApp.get("/agents/:role", async (c) => {
	const role = c.req.param("role") as AgentRole;
	const { stub, id } = agentStub(c.env, role);
	const identity = await stub.getIdentity(id);
	const memory = await stub.getMemory(id);
	if (!identity) return c.json({ error: "not found" }, 404);
	return c.json({ identity, memory });
});

missionsApp.patch("/agents/:role", async (c) => {
	const role = c.req.param("role") as AgentRole;
	const { stub, id } = agentStub(c.env, role);
	const patch = await c.req.json();
	const updated = await stub.updateIdentity(id, patch);
	return c.json({ identity: updated });
});

missionsApp.patch("/agents/:role/memory", async (c) => {
	const role = c.req.param("role") as AgentRole;
	const { stub, id } = agentStub(c.env, role);
	const patch = await c.req.json();
	const updated = await stub.updateMemory(id, patch);
	return c.json({ memory: updated });
});

// ── Missions ─────────────────────────────────────────────────────────

missionsApp.post("/missions", async (c) => {
	const body = await c.req.json<{
		brief: string;
		agent_role: AgentRole;
		preseeded_targets?: { name: string; email: string; context: string }[];
		force_outreach?: boolean;
	}>();
	const missionId = crypto.randomUUID();
	const agentId = agentDoKey(DEFAULT_USER_ID, body.agent_role);
	const stub = missionStub(c.env, missionId);
	const opts: Record<string, unknown> = {};
	if (body.preseeded_targets) opts.preseeded = body.preseeded_targets;
	if (body.force_outreach) opts.force_outreach = true;
	await stub.createMission({
		id: missionId,
		userId: DEFAULT_USER_ID,
		agentId,
		brief: body.brief,
		completionCondition: Object.keys(opts).length ? opts : undefined,
	});

	// Kick off the workflow in the background.
	c.executionCtx.waitUntil(
		stub.startMission(missionId).catch((err) =>
			console.error(`[missions/api] startMission failed:`, err),
		),
	);

	return c.json({ mission_id: missionId });
});

// A lightweight index. Actual mission rows live inside their DO, so we
// can't list across them without an external index. For MVP we keep a
// projection in the UserDO. TODO: add a mission_index table on UserDO.
missionsApp.get("/missions", async (c) => {
	// Stub: no cross-DO index yet. UI will pass the mission IDs it's aware
	// of (stored in localStorage per-user) and we fetch each.
	const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean);
	const missions = await Promise.all(
		ids.map(async (id) => {
			const m = await missionStub(c.env, id).getMission(id);
			return m;
		}),
	);
	return c.json({ missions: missions.filter(Boolean) });
});

missionsApp.get("/missions/:id", async (c) => {
	const id = c.req.param("id");
	const stub = missionStub(c.env, id);
	const mission = await stub.getMission(id);
	if (!mission) return c.json({ error: "not found" }, 404);
	const threads = await stub.listThreads(id);
	const targets = await stub.listTargets(id);
	const pendingApprovals = await stub.listPendingApprovals(id);
	return c.json({ mission, threads, targets, pending_approvals: pendingApprovals });
});

missionsApp.get("/missions/:id/activity", async (c) => {
	const id = c.req.param("id");
	const limit = Number(c.req.query("limit") ?? "200");
	const events = await missionStub(c.env, id).listActivity(id, limit);
	return c.json({ events });
});

missionsApp.get("/missions/:id/research-log", async (c) => {
	const id = c.req.param("id");
	const entries = await missionStub(c.env, id).listResearchLog(id);
	return c.json({ entries });
});

missionsApp.get("/missions/:id/threads/:threadId", async (c) => {
	const id = c.req.param("id");
	const threadId = c.req.param("threadId");
	const stub = missionStub(c.env, id);
	const thread = await stub.getThread(threadId);
	if (!thread) return c.json({ error: "not found" }, 404);
	const messages = await stub.listMessages(threadId);
	return c.json({ thread, messages });
});

missionsApp.post("/missions/:id/threads/:threadId/take-over", async (c) => {
	const id = c.req.param("id");
	const threadId = c.req.param("threadId");
	const stub = missionStub(c.env, id);
	await stub.setThreadStatus(threadId, "human");
	await stub.logActivity({
		missionId: id,
		type: "thread.taken_over",
		description: "User took over this thread; the agent is stepping back.",
		metadata: { thread_id: threadId },
	});
	return c.json({ ok: true });
});

missionsApp.post("/missions/:id/approvals/:approvalId/resolve", async (c) => {
	const id = c.req.param("id");
	const approvalId = c.req.param("approvalId");
	const resolution = await c.req.json();
	const stub = missionStub(c.env, id);
	await stub.resolveApprovalFromUser(approvalId, resolution);
	return c.json({ ok: true });
});

missionsApp.post("/missions/:id/pause", async (c) => {
	const id = c.req.param("id");
	await missionStub(c.env, id).setPhase(id, "paused");
	return c.json({ ok: true });
});

missionsApp.post("/missions/:id/resume", async (c) => {
	const id = c.req.param("id");
	await missionStub(c.env, id).setPhase(id, "monitoring");
	return c.json({ ok: true });
});

missionsApp.post("/missions/:id/cancel", async (c) => {
	const id = c.req.param("id");
	await missionStub(c.env, id).setPhase(id, "cancelled");
	return c.json({ ok: true });
});

// ── Contacts (shared across missions) ────────────────────────────────

missionsApp.get("/contacts", async (c) => {
	const contacts = await listContacts(c.env);
	return c.json({ contacts });
});

missionsApp.get("/contacts/:email", async (c) => {
	const email = c.req.param("email");
	const history = await getContactHistory(c.env, email);
	if (!history) return c.json({ error: "not found" }, 404);
	return c.json(history);
});

missionsApp.post("/contacts/:email/suppress", async (c) => {
	const email = c.req.param("email");
	await suppressContact(c.env, email);
	return c.json({ ok: true });
});

missionsApp.post("/contacts/:email/outcome", async (c) => {
	const email = c.req.param("email");
	const body = await c.req.json<{ outcome: Parameters<typeof setContactOutcome>[2] }>();
	await setContactOutcome(c.env, email, body.outcome);
	return c.json({ ok: true });
});
