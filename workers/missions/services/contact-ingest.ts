// Contact ingestion — the cross-cut every email send/receive/research call
// must go through. Writes to the UserDO's contacts + contact_activity tables
// and surfaces the read primitives the target-enrichment prompt needs.
//
// See docs/missions-prd.md § Contacts. The PRD is explicit that this layer
// lands before any email code — it is easier to build up front than to
// retrofit. Every outbound send, every inbound reply, every research note
// about a person calls recordInteraction().

import type { Env } from "../../types";
import { DEFAULT_USER_ID } from "../index";
import type {
	ContactRow,
	ContactActivityRow,
	RecordInteractionInput,
} from "../user-do";
import type { ContactOutcome, ContactStatus } from "../db/user-schema";

function userStub(env: Env, userId: string = DEFAULT_USER_ID) {
	const id = env.USER_DO.idFromName(userId);
	return env.USER_DO.get(id);
}

export async function recordInteraction(
	env: Env,
	input: RecordInteractionInput,
): Promise<ContactRow> {
	return userStub(env, input.userId).recordInteraction(input);
}

export interface ContactHistory {
	contact: ContactRow;
	activity: ContactActivityRow[];
}

export async function getContactHistory(
	env: Env,
	email: string,
	userId: string = DEFAULT_USER_ID,
): Promise<ContactHistory | null> {
	return userStub(env, userId).getContactHistory(userId, email);
}

export async function isSuppressed(
	env: Env,
	email: string,
	userId: string = DEFAULT_USER_ID,
): Promise<boolean> {
	return userStub(env, userId).isSuppressed(userId, email);
}

export async function suppressContact(
	env: Env,
	email: string,
	userId: string = DEFAULT_USER_ID,
): Promise<void> {
	return userStub(env, userId).suppress(userId, email);
}

export async function setContactOutcome(
	env: Env,
	email: string,
	outcome: ContactOutcome,
	userId: string = DEFAULT_USER_ID,
): Promise<void> {
	return userStub(env, userId).setOutcome(userId, email, outcome);
}

export async function listContacts(
	env: Env,
	userId: string = DEFAULT_USER_ID,
	filter?: { status?: ContactStatus },
): Promise<ContactRow[]> {
	return userStub(env, userId).listContacts(userId, filter);
}

// ── Behavior classifier used by the target-enrichment prompt ──────────
// Turns raw ContactHistory into the five-way decision the PRD describes
// (§ Contacts → "How contacts shape agent behavior"). The caller still
// asks the LLM for the final draft/skip/hold decision, but this classifier
// gives it the structured input it needs.

export type ContactRecommendation =
	| "fresh" // no history — email as normal
	| "reference_prior" // prior warm/positive thread — reference it
	| "skip_declined" // prior polite decline — skip by default
	| "ask_ghosted" // prior ghost after follow-ups — user multi-choice
	| "hold_active" // active thread exists — don't start a new one
	| "skip_suppressed"; // globally suppressed — hard exclusion

export function recommendContactBehavior(
	history: ContactHistory | null,
): ContactRecommendation {
	if (!history) return "fresh";
	const { contact, activity } = history;

	if (contact.status === "suppressed") return "skip_suppressed";

	const hasOutreach = activity.some(
		(a) => a.type === "email_sent" || a.type === "email_received",
	);
	if (!hasOutreach) return "fresh";

	// Prior outreach exists — categorise by last known outcome.
	switch (contact.last_outcome) {
		case "declined":
		case "negative":
			return "skip_declined";
		case "ghosted":
			return "ask_ghosted";
		case "active":
			return "hold_active";
		case "positive":
		case "booked":
			return "reference_prior";
		default:
			// Outreach happened but no outcome set yet — treat as active.
			return "hold_active";
	}
}

// ── Prompt-friendly summary ─────────────────────────────────────────
// The outreach-draft and target-enrichment prompts both need a short
// human-readable summary of prior history. Keep it compact — the LLM
// sees this inline.

export function summarizeContactHistory(history: ContactHistory | null): string {
	if (!history) return "No prior history. This is a new contact.";
	const { contact, activity } = history;
	const parts: string[] = [];
	parts.push(
		`${contact.name ?? contact.email} — ${contact.total_interactions} prior interaction(s), last ${contact.last_interaction_at}.`,
	);
	if (contact.last_outcome) parts.push(`Last outcome: ${contact.last_outcome}.`);
	if (contact.role_context) parts.push(`Role/context: ${contact.role_context}.`);
	if (contact.notes) parts.push(`Notes: ${contact.notes}`);
	const recent = activity.slice(0, 5);
	if (recent.length) {
		parts.push("Recent activity:");
		for (const a of recent) {
			const mission = a.mission_id ? ` [mission ${a.mission_id.slice(0, 8)}]` : "";
			parts.push(`  • ${a.timestamp} ${a.type}${mission}: ${a.summary ?? ""}`);
		}
	}
	return parts.join("\n");
}
