// Translation layer from internal event types / phases to user-facing
// strings. Raw event names like "reply.classified" are plumbing; the UI
// should never show them directly.

import type { ActivityEvent, MissionPhase } from "~/services/missions-api";

export type ActivityKind = "email" | "system" | "approval" | "milestone";

export interface ActivityLabel {
	title: string;
	kind: ActivityKind;
	detail?: string;
}

function parseMeta(event: ActivityEvent): Record<string, unknown> {
	if (!event.metadata) return {};
	try {
		const parsed = JSON.parse(event.metadata);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function labelForEvent(event: ActivityEvent): ActivityLabel {
	const meta = parseMeta(event);

	switch (event.type) {
		case "mission.created":
			return { title: "Mission created", kind: "milestone" };
		case "mission.phase_changed": {
			const phase = extractPhaseFromDescription(event.description);
			return {
				title: phase ? `Phase: ${phaseLabel(phase)}` : "Phase changed",
				kind: "system",
			};
		}
		case "mission.brief_updated":
			return { title: "Mission edited", kind: "system" };
		case "mission.auto_completed":
			return {
				title: "Mission complete",
				kind: "milestone",
				detail: "All threads wrapped up.",
			};
		case "mission.answered":
			return {
				title: "Mission answered",
				kind: "milestone",
				detail: event.description,
			};
		case "understand.clarification_needed":
			return { title: "Needs a clarification", kind: "approval" };
		case "understand.interpreted":
			return { title: "Mission understood", kind: "system" };
		case "understand.clarified":
			return { title: "Clarified by you", kind: "system" };
		case "research.candidates": {
			const count =
				typeof meta.candidates === "object" && Array.isArray(meta.candidates)
					? meta.candidates.length
					: undefined;
			return {
				title: count
					? `Found ${count} candidate${count === 1 ? "" : "s"}`
					: "Researched candidates",
				kind: "system",
			};
		}
		case "research.target_forced":
			return { title: "Target forced", kind: "system" };
		case "research.target_triaged":
			return { title: "Target reviewed", kind: "system" };
		case "outreach.nothing_to_send":
			return { title: "No outreach to send", kind: "system" };
		case "email.sent":
			return { title: "Email sent", kind: "email" };
		case "email.drafted":
			return { title: "Email draft (not delivered)", kind: "email" };
		case "email.received":
			return { title: "Reply received", kind: "email" };
		case "reply.classified": {
			const classification = extractClassification(event.description);
			return {
				title: classification
					? `Reply read: ${classification}`
					: "Reply read",
				kind: "system",
			};
		}
		case "reply.sent_with_user_input":
			return { title: "Reply sent (using your answer)", kind: "email" };
		case "reply.sent_multi_choice":
			return { title: "Reply sent", kind: "email" };
		case "referral.detected":
			return { title: "Someone else was suggested", kind: "system" };
		case "target.added_from_referral":
			return { title: "Target added from referral", kind: "system" };
		case "target.skipped_by_user":
			return { title: "Target skipped", kind: "system" };
		case "approval.requested":
			return { title: "Needs you", kind: "approval" };
		case "approval.resolved":
			return { title: "Approval resolved", kind: "approval" };
		case "handoff.proposed":
			return { title: "Handoff prepared", kind: "milestone" };
		case "handoff.sent":
			return { title: "Handoff sent", kind: "milestone" };
		case "handoff.cancelled_by_user":
			return { title: "Handoff cancelled", kind: "system" };
		case "thread.taken_over":
			return { title: "You took over the thread", kind: "system" };
		default:
			return { title: toTitle(event.type), kind: "system" };
	}
}

export function phaseLabel(phase: MissionPhase | string): string {
	switch (phase) {
		case "draft":
			return "Draft";
		case "understand":
			return "Reading brief";
		case "research":
			return "Researching";
		case "awaiting-approval":
			return "Needs you";
		case "outreach":
			return "Reaching out";
		case "monitoring":
			return "Awaiting replies";
		case "handoff":
			return "Handoff pending";
		case "complete":
			return "Complete";
		case "paused":
			return "Paused";
		case "cancelled":
			return "Cancelled";
		default:
			return toTitle(String(phase));
	}
}

function extractPhaseFromDescription(desc: string): string | null {
	const match = desc.match(/phase\s*→\s*([a-z_-]+)/i);
	return match ? match[1] : null;
}

function extractClassification(desc: string): string | null {
	// Format: "<classification> → <action>. <rationale>"
	const match = desc.match(/^([a-z_]+)\s*→/i);
	return match ? match[1].replace(/_/g, " ") : null;
}

function toTitle(raw: string): string {
	return raw
		.replace(/[._]/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}
