// Mission workflow — the Otto-only implementation of the four-phase state
// machine: understand → research → outreach → (reply handling) → handoff.
//
// Design invariants (from docs/missions-prd.md § Approval model + implementation notes):
// - Otto sends his own first email with no pre-approval.
// - Only three things pause the workflow:
//   1. understand: genuinely ambiguous brief (freeform approval)
//   2. reply: unknown-question inbound (freeform approval) or ambiguous+options (multi-choice)
//   3. handoff: silent-confirm with 2h default window
// - Take-over is thread-level and NOT an approval; threads with status="human"
//   are excluded from all future agent action on that thread.

import type { Env } from "../../types";
import type { MissionDO, MessageRow, ThreadRow } from "../mission-do";
import type { AgentIdentity, AgentMemory } from "../agent-do";
import type { ScheduledTaskKind } from "../db/mission-schema";
import {
	DEFAULT_USER_ID,
	agentDoKey,
	type AgentRole,
} from "../index";
import {
	recordInteraction,
	getContactHistory,
	recommendContactBehavior,
	summarizeContactHistory,
	isSuppressed,
} from "../services/contact-ingest";
import { runUnderstand } from "../prompts/understand";
import {
	runTargetEnrichment,
	type TargetEnrichmentAction,
} from "../prompts/target-enrichment";
import { runOutreachDraft } from "../prompts/outreach-draft";
import {
	runReplyClassifier,
	type ReplyClassifierResult,
} from "../prompts/reply-classifier";
import { runHandoffDraft } from "../prompts/handoff-draft";
import { runResearch } from "../services/research";
import { sendEmail } from "../services/email-out";

// The silent-confirm window for handoffs (PRD: default 2 hours).
const HANDOFF_CONFIRM_MS = 2 * 60 * 60 * 1000;

export interface ScheduledTaskDispatch {
	taskId: string;
	missionId: string;
	kind: ScheduledTaskKind;
	payload: unknown;
}

// ── Entry: startMission ──────────────────────────────────────────────

export async function startMission(
	mdo: MissionDO,
	env: Env,
	missionId: string,
): Promise<void> {
	const mission = await mdo.getMission(missionId);
	if (!mission) throw new Error(`Mission ${missionId} not found`);

	// Step 1: understand
	await mdo.setPhase(missionId, "understand");
	const agentRole = agentRoleFromId(mission.agent_id);
	const userName = await fetchUserName(env);
	const understood = await runUnderstand(env, {
		brief: mission.brief,
		agentRole,
		userName,
	});

	if (!understood.clear) {
		// Ask the user one specific clarifying question.
		await mdo.logActivity({
			missionId,
			type: "understand.clarification_needed",
			description: understood.clarifying_question,
		});
		await mdo.createApproval({
			mission_id: missionId,
			thread_id: null,
			type: "freeform",
			prompt: understood.clarifying_question,
			context: JSON.stringify({ phase: "understand" }),
			options: null,
			proposed_action: null,
			timeout_at: null,
			default_behavior: "hold",
		});
		await mdo.setPhase(missionId, "awaiting-approval");
		return;
	}

	await mdo.logActivity({
		missionId,
		type: "understand.interpreted",
		description: understood.interpretation,
		metadata: understood.plan,
	});

	// Persist plan on the mission row (reuse completion_condition for JSON).
	// NOTE: we keep the plan alongside completion_condition JSON.
	await mdo.addResearchLog({
		mission_id: missionId,
		type: "note",
		content: `Plan: ${understood.plan.goal}. Target criteria: ${understood.plan.target_criteria}. Completion: ${understood.plan.completion_signal}.`,
		source_url: null,
		related_contact_id: null,
	});

	// Step 2: research
	await advanceToResearch(mdo, env, missionId, understood.plan.target_count);

	// Step 3: outreach — send first touch to each non-skipped target
	await advanceToOutreach(mdo, env, missionId);
}

async function advanceToResearch(
	mdo: MissionDO,
	env: Env,
	missionId: string,
	targetCount: number | null,
): Promise<void> {
	await mdo.setPhase(missionId, "research");
	const mission = (await mdo.getMission(missionId))!;
	const agentRole = agentRoleFromId(mission.agent_id);

	const research = await runResearch(env, {
		missionBrief: mission.brief,
		agentRole,
		targetCount,
	});

	await mdo.addResearchLog({
		mission_id: missionId,
		type: "synthesis",
		content: `Research: ${research.source}. ${research.notes} (${research.candidates.length} candidates)`,
		source_url: null,
		related_contact_id: null,
	});
	await mdo.logActivity({
		missionId,
		type: "research.candidates",
		description: `${research.candidates.length} candidate(s) surfaced via ${research.source}`,
		metadata: { candidates: research.candidates },
	});

	// For each candidate: contact check, enrichment, decide.
	for (const c of research.candidates) {
		if (await isSuppressed(env, c.email)) {
			await mdo.addResearchLog({
				mission_id: missionId,
				type: "contact_check",
				content: `Skipped ${c.email}: globally suppressed.`,
				source_url: null,
				related_contact_id: null,
			});
			continue;
		}

		const history = await getContactHistory(env, c.email);
		const recommendation = recommendContactBehavior(history);
		const historySummary = summarizeContactHistory(history);

		const enrich = await runTargetEnrichment(env, {
			missionBrief: mission.brief,
			targetName: c.name,
			targetEmail: c.email,
			targetContext: c.context,
			recommendation,
			historySummary,
		});

		await mdo.addResearchLog({
			mission_id: missionId,
			type: "contact_check",
			content: `${c.email} → ${enrich.action}: ${enrich.reasoning}`,
			source_url: null,
			related_contact_id: history?.contact.id ?? null,
		});

		if (
			enrich.action === "skip_declined" ||
			enrich.action === "skip_suppressed" ||
			enrich.action === "hold_active"
		) {
			// Record the target as skipped so it shows in the UI with a reason.
			await mdo.addTarget({
				missionId,
				email: c.email,
				name: c.name,
				context: { rationale: c.context, triage: enrich },
				status: "skipped_prior_history",
				contactId: history?.contact.id ?? undefined,
			});
			continue;
		}

		if (enrich.action === "ask_ghosted") {
			// Escalate as multi-choice — user decides per target.
			const target = await mdo.addTarget({
				missionId,
				email: c.email,
				name: c.name,
				context: { rationale: c.context, triage: enrich },
				status: "pending",
				contactId: history?.contact.id ?? undefined,
			});
			await mdo.createApproval({
				mission_id: missionId,
				thread_id: null,
				type: "multi_choice",
				prompt: `Reach out to ${c.name ?? c.email} again? Last time they didn't reply after follow-ups.`,
				context: JSON.stringify({
					phase: "research",
					target_id: target.id,
					target_email: c.email,
				}),
				options: JSON.stringify([
					{ id: "try_again", label: "Try again with a fresh angle" },
					{ id: "skip", label: "Skip this target" },
					{ id: "show_me", label: "Show me the previous thread first" },
				]),
				proposed_action: null,
				timeout_at: null,
				default_behavior: "hold",
			});
			continue;
		}

		// proceed_fresh or reference_prior — add as pending target.
		await mdo.addTarget({
			missionId,
			email: c.email,
			name: c.name,
			context: {
				rationale: c.context,
				triage: enrich,
				reference_hint: enrich.reference_hint ?? null,
			},
			status: "pending",
			contactId: history?.contact.id ?? undefined,
		});
	}
}

async function advanceToOutreach(
	mdo: MissionDO,
	env: Env,
	missionId: string,
): Promise<void> {
	await mdo.setPhase(missionId, "outreach");
	const mission = (await mdo.getMission(missionId))!;
	const agent = await loadAgent(env, mission.agent_id);
	const agentEmail = `${agent.identity.email_local_part}@${await fetchDomain(env)}`;
	const userName = await fetchUserName(env);
	const userEmail = await fetchUserEmail(env);

	const targets = await mdo.listTargets(missionId);
	const pending = targets.filter((t) => t.status === "pending");

	for (const t of pending) {
		const history = await getContactHistory(env, t.email);
		const historySummary = summarizeContactHistory(history);
		const triageContext = t.context ? JSON.parse(t.context) : null;
		const referenceHint = triageContext?.reference_hint ?? undefined;

		const researchLogEntries = await mdo.listResearchLog(missionId);
		const researchNotes = researchLogEntries
			.filter(
				(r) =>
					r.type !== "contact_check" ||
					r.related_contact_id === (history?.contact.id ?? null),
			)
			.slice(-10)
			.map((r) => `• ${r.content}`)
			.join("\n");

		const draft = await runOutreachDraft(env, {
			missionBrief: mission.brief,
			userName,
			userEmail,
			agent: agent.identity,
			agentEmail,
			memory: agent.memory,
			target: { name: t.name, email: t.email, context: triageContext?.rationale ?? null },
			contactHistorySummary: historySummary,
			referenceHint,
			researchNotes,
			isFirstTouch: !history,
		});

		// Open a thread.
		const thread = await mdo.createThread({
			missionId,
			targetId: t.id,
			contactId: t.contact_id ?? undefined,
			subject: draft.subject,
		});

		// Send email — this also records the contact interaction.
		await sendEmail(env, mdo, {
			missionId,
			threadId: thread.id,
			from: agentEmail,
			to: t.email,
			subject: draft.subject,
			body: draft.body,
			agentId: mission.agent_id,
		});

		await mdo.setTargetStatus(t.id, "contacted");
		await mdo.logActivity({
			missionId,
			type: "email.sent",
			description: `Sent first-touch email to ${t.email}: "${draft.subject}"`,
			metadata: { thread_id: thread.id, subject: draft.subject },
		});
	}

	// Transition to monitoring once all first-touches are out.
	await mdo.setPhase(missionId, "monitoring");
}

// ── Inbound reply handling ──────────────────────────────────────────

export async function handleInbound(
	mdo: MissionDO,
	env: Env,
	threadId: string,
	inbound: Omit<MessageRow, "id" | "thread_id" | "direction">,
): Promise<void> {
	const thread = await mdo.getThread(threadId);
	if (!thread) return;

	if (thread.status === "human") {
		// User took over this thread — do nothing.
		return;
	}

	// Store the inbound message.
	await mdo.addMessage({
		thread_id: threadId,
		direction: "in",
		from_addr: inbound.from_addr,
		to_addr: inbound.to_addr,
		cc: inbound.cc,
		subject: inbound.subject,
		body: inbound.body,
		sent_at: inbound.sent_at,
		message_id: inbound.message_id,
		in_reply_to: inbound.in_reply_to,
	});
	await mdo.logActivity({
		missionId: thread.mission_id,
		type: "email.received",
		description: `Reply from ${inbound.from_addr}: "${inbound.subject ?? "(no subject)"}"`,
		metadata: { thread_id: threadId },
	});

	// Record contact interaction
	const mission = (await mdo.getMission(thread.mission_id))!;
	await recordInteraction(env, {
		userId: DEFAULT_USER_ID,
		agentId: mission.agent_id,
		missionId: mission.id,
		email: inbound.from_addr,
		type: "email_received",
		summary: inbound.subject ?? inbound.body.slice(0, 120),
	});

	// Classify.
	const agent = await loadAgent(env, mission.agent_id);
	const threadMessages = await mdo.listMessages(threadId);
	const threadContext = threadMessages
		.slice(-4)
		.map(
			(m) =>
				`[${m.direction} ${m.sent_at}] ${m.from_addr} → ${m.to_addr}\nSubject: ${m.subject ?? ""}\n${m.body}`,
		)
		.join("\n\n---\n\n");

	const result = await runReplyClassifier(env, {
		agent: agent.identity,
		memory: agent.memory,
		missionBrief: mission.brief,
		threadContext,
		inbound: {
			from: inbound.from_addr,
			subject: inbound.subject,
			body: inbound.body,
		},
	});

	await mdo.logActivity({
		missionId: thread.mission_id,
		type: "reply.classified",
		description: `${result.classification} → ${result.action}. ${result.rationale}`,
		metadata: { thread_id: threadId },
	});

	await applyReplyAction(mdo, env, thread, mission, agent, result);
}

async function applyReplyAction(
	mdo: MissionDO,
	env: Env,
	thread: ThreadRow,
	mission: { id: string; brief: string; agent_id: string },
	agent: LoadedAgent,
	result: ReplyClassifierResult,
): Promise<void> {
	const domain = await fetchDomain(env);
	const agentEmail = `${agent.identity.email_local_part}@${domain}`;

	switch (result.action) {
		case "auto_reply":
		case "auto_reply_toward_handoff": {
			if (!result.draft_reply) return;
			await sendEmail(env, mdo, {
				missionId: mission.id,
				threadId: thread.id,
				from: agentEmail,
				to: thread.target_id ? await resolveTargetEmail(mdo, thread) : "",
				subject: result.draft_reply.subject,
				body: result.draft_reply.body,
				agentId: mission.agent_id,
			});
			await mdo.setThreadStatus(
				thread.id,
				result.action === "auto_reply_toward_handoff" ? "awaiting" : "active",
			);
			if (result.action === "auto_reply_toward_handoff") {
				await prepareHandoff(mdo, env, thread.id);
			}
			return;
		}
		case "auto_close": {
			if (!result.draft_reply) return;
			await sendEmail(env, mdo, {
				missionId: mission.id,
				threadId: thread.id,
				from: agentEmail,
				to: await resolveTargetEmail(mdo, thread),
				subject: result.draft_reply.subject,
				body: result.draft_reply.body,
				agentId: mission.agent_id,
			});
			await mdo.setThreadStatus(thread.id, "declined");
			return;
		}
		case "ask_user_freeform": {
			await mdo.createApproval({
				mission_id: mission.id,
				thread_id: thread.id,
				type: "freeform",
				prompt: result.freeform_prompt ?? "They asked something I don't know how to answer.",
				context: JSON.stringify({
					phase: "reply",
					thread_id: thread.id,
				}),
				options: null,
				proposed_action: null,
				timeout_at: null,
				default_behavior: "hold",
			});
			await mdo.setThreadStatus(thread.id, "awaiting");
			return;
		}
		case "ask_user_multi_choice": {
			await mdo.createApproval({
				mission_id: mission.id,
				thread_id: thread.id,
				type: "multi_choice",
				prompt: result.multi_choice?.prompt ?? "Which should I send?",
				context: JSON.stringify({
					phase: "reply",
					thread_id: thread.id,
				}),
				options: JSON.stringify(result.multi_choice?.options ?? []),
				proposed_action: null,
				timeout_at: null,
				default_behavior: "hold",
			});
			await mdo.setThreadStatus(thread.id, "awaiting");
			return;
		}
		case "take_no_action":
		default:
			return;
	}
}

async function resolveTargetEmail(mdo: MissionDO, thread: ThreadRow): Promise<string> {
	// The thread's target_id is a TargetRow — fetch its email.
	// We don't have a direct getTarget method, so scan listTargets (MVP).
	const targets = await mdo.listTargets(thread.mission_id);
	const target = targets.find((t) => t.id === thread.target_id);
	return target?.email ?? "";
}

// ── Handoff (silent-confirm) ─────────────────────────────────────────

export async function prepareHandoff(
	mdo: MissionDO,
	env: Env,
	threadId: string,
): Promise<void> {
	const thread = await mdo.getThread(threadId);
	if (!thread) return;
	const mission = (await mdo.getMission(thread.mission_id))!;
	const agent = await loadAgent(env, mission.agent_id);
	const agentEmail = `${agent.identity.email_local_part}@${await fetchDomain(env)}`;
	const userEmail = await fetchUserEmail(env);
	const userName = await fetchUserName(env);

	const targetEmail = await resolveTargetEmail(mdo, thread);
	const messages = await mdo.listMessages(threadId);
	const threadContext = messages
		.slice(-6)
		.map(
			(m) =>
				`[${m.direction}] ${m.from_addr} → ${m.to_addr}\n${m.body}`,
		)
		.join("\n\n---\n\n");

	const targets = await mdo.listTargets(thread.mission_id);
	const target = targets.find((t) => t.id === thread.target_id);

	const draft = await runHandoffDraft(env, {
		agent: agent.identity,
		agentEmail,
		userName,
		userEmail,
		missionBrief: mission.brief,
		recipient: { name: target?.name ?? null, email: targetEmail },
		threadContext,
	});

	const fireAt = new Date(Date.now() + HANDOFF_CONFIRM_MS);
	const approval = await mdo.createApproval({
		mission_id: mission.id,
		thread_id: threadId,
		type: "silent_confirm",
		prompt: `Sending handoff email to ${target?.name ?? targetEmail} in ~2 hours. Tell me to hold if needed.`,
		context: JSON.stringify({ phase: "handoff", thread_id: threadId }),
		options: null,
		proposed_action: JSON.stringify({
			kind: "send_handoff",
			from: agentEmail,
			to: draft.to,
			cc: draft.cc,
			subject: draft.subject,
			body: draft.body,
		}),
		timeout_at: fireAt.toISOString(),
		default_behavior: "proceed",
	});

	await mdo.scheduleTask({
		missionId: mission.id,
		kind: "silent_confirm_timeout",
		fireAt,
		payload: { approval_id: approval.id },
	});

	await mdo.setPhase(mission.id, "handoff");
	await mdo.logActivity({
		missionId: mission.id,
		type: "handoff.proposed",
		description: `Handoff draft prepared for ${targetEmail}. Silent-confirm expires at ${fireAt.toISOString()}.`,
		metadata: { thread_id: threadId, approval_id: approval.id },
	});
}

// ── User resolution of approvals ─────────────────────────────────────

export async function handleApprovalResolution(
	mdo: MissionDO,
	env: Env,
	approvalId: string,
	resolution: unknown,
): Promise<void> {
	// Mark approval resolved in storage.
	await mdo.resolveApproval(approvalId, resolution);
	// TODO: read approval context and route to the appropriate follow-up
	// (e.g. freeform for a reply → send user's text as the outbound).
	// For MVP, silent-confirm is the most important path and it's handled by
	// the alarm/timeout. Reply-approval resumption is wired in Phase 5.
}

// ── Scheduled task dispatcher ────────────────────────────────────────

export async function dispatchScheduled(
	mdo: MissionDO,
	env: Env,
	task: ScheduledTaskDispatch,
): Promise<void> {
	if (task.kind === "silent_confirm_timeout") {
		const payload = task.payload as { approval_id: string };
		await executeSilentConfirm(mdo, env, payload.approval_id);
	}
	// followup_send and handoff_reminder reserved for later.
}

async function executeSilentConfirm(
	mdo: MissionDO,
	env: Env,
	approvalId: string,
): Promise<void> {
	const approval = await mdo.getApproval(approvalId);
	if (!approval || approval.status !== "pending") return; // Already resolved.

	// Act on the proposed action.
	const proposed = approval.proposed_action
		? (JSON.parse(approval.proposed_action) as {
				kind: "send_handoff";
				from: string;
				to: string;
				cc?: string;
				subject: string;
				body: string;
		  })
		: null;

	if (proposed?.kind === "send_handoff") {
		const mission = (await mdo.getMission(approval.mission_id))!;
		await sendEmail(env, mdo, {
			missionId: mission.id,
			threadId: approval.thread_id!,
			from: proposed.from,
			to: proposed.to,
			cc: proposed.cc,
			subject: proposed.subject,
			body: proposed.body,
			agentId: mission.agent_id,
		});
		await mdo.setThreadStatus(approval.thread_id!, "human");
		await mdo.setPhase(mission.id, "complete");
		await mdo.logActivity({
			missionId: mission.id,
			type: "handoff.sent",
			description: `Handoff email sent to ${proposed.to}; user cc'd on ${proposed.cc ?? "(none)"}.`,
			metadata: { thread_id: approval.thread_id },
		});
	}

	await mdo.resolveApproval(
		approvalId,
		{ auto: true, proposed_action_applied: true },
		"resolved",
	);
}

// ── Small utilities ──────────────────────────────────────────────────

interface LoadedAgent {
	identity: AgentIdentity;
	memory: AgentMemory | null;
}

function agentRoleFromId(agentId: string): AgentRole {
	const [, role] = agentId.split(":");
	return (role ?? "otto") as AgentRole;
}

async function loadAgent(env: Env, agentId: string): Promise<LoadedAgent> {
	const stub = env.AGENT_DO.get(env.AGENT_DO.idFromName(agentId));
	const identity = await stub.getIdentity(agentId);
	const memory = await stub.getMemory(agentId);
	if (!identity) {
		throw new Error(`Agent ${agentId} not found — run bootstrap first.`);
	}
	return { identity, memory };
}

async function fetchDomain(env: Env): Promise<string> {
	// DOMAINS is a string var configured in wrangler.jsonc. In dev we use
	// whatever the user set. For MVP, take the first one.
	const d = env.DOMAINS as unknown as string | string[];
	if (typeof d === "string") return d;
	return d[0] ?? "example.com";
}

async function fetchUserName(env: Env): Promise<string> {
	const stub = env.USER_DO.get(env.USER_DO.idFromName(DEFAULT_USER_ID));
	const user = await stub.getUser(DEFAULT_USER_ID);
	return user?.name ?? user?.email ?? "(user)";
}

async function fetchUserEmail(env: Env): Promise<string> {
	const stub = env.USER_DO.get(env.USER_DO.idFromName(DEFAULT_USER_ID));
	const user = await stub.getUser(DEFAULT_USER_ID);
	return user?.email ?? "user@example.com";
}
