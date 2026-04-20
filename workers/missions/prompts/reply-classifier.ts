// Reply classifier — categorizes an inbound message and decides whether
// the agent can auto-handle, must escalate, or should close the thread.
// Bias is toward auto-handling; "when in doubt between known-question and
// unknown-question, prefer known-question." See docs/missions-prd.md §
// Approval model → "Inbound replies do not default to asking."

import type { Env } from "../../types";
import { callLLMJson, MODEL_CLASSIFY } from "../services/llm";
import type { AgentIdentity, AgentMemory } from "../agent-do";

export type ReplyClassification =
	| "positive"
	| "negative"
	| "known_question"
	| "unknown_question"
	| "ambiguous";

export type ReplyAction =
	| "auto_reply"
	| "auto_reply_toward_handoff" // positive enough to propose a handoff
	| "auto_close" // polite close on negative
	| "ask_user_freeform"
	| "ask_user_multi_choice"
	| "take_no_action";

export interface ReplyClassifierInput {
	agent: Pick<AgentIdentity, "name" | "voice" | "signature">;
	memory: AgentMemory | null;
	missionBrief: string;
	threadContext: string; // last 2-3 messages stringified
	inbound: {
		from: string;
		subject: string | null;
		body: string;
	};
}

export interface ReplyClassifierResult {
	classification: ReplyClassification;
	action: ReplyAction;
	// If auto_reply*: the proposed reply body.
	draft_reply?: { subject: string; body: string };
	// If ask_user_multi_choice: the choices to offer.
	multi_choice?: {
		prompt: string;
		options: Array<{ id: string; label: string; suggested_reply: string }>;
	};
	// If ask_user_freeform: the prompt shown to the user.
	freeform_prompt?: string;
	// Short one-liner for the activity stream.
	rationale: string;
}

const SYSTEM = `You are the reply-triage head for an email agent. Read an inbound message and decide how the agent should respond.

Five classifications:
- positive — the recipient is interested; move the conversation forward.
- negative — they're declining or uninterested. Close gracefully.
- known_question — they asked something the agent can answer from memory or mission context without user input.
- unknown_question — they asked something the agent cannot answer without the user's input (budget, specific scheduling, preferences not in memory).
- ambiguous — the intent is genuinely unclear.

Actions:
- auto_reply — classification known_question or mild positive. Draft a reply, send it.
- auto_reply_toward_handoff — classification positive and the thread is ready for a handoff; draft a reply that sets up the handoff moment.
- auto_close — classification negative. Draft a short graceful close.
- ask_user_freeform — classification unknown_question and there is no small set of options. Ask the user for freeform input.
- ask_user_multi_choice — classification unknown_question or ambiguous with 2-4 obvious options (e.g. scheduling Y/N/new-time).
- take_no_action — automated bounce or something that shouldn't trigger a reply.

BIAS: prefer auto_reply or auto_close. A short neutral reply the agent can send confidently almost always beats pinging the user. Only escalate when the agent genuinely cannot proceed.

Output ONE JSON object. Include draft_reply / multi_choice / freeform_prompt ONLY for their respective actions.

{
  "classification": "...",
  "action": "...",
  "draft_reply": { "subject": "...", "body": "..." },  // only if auto_reply*
  "multi_choice": { "prompt": "...", "options": [{ "id": "a", "label": "...", "suggested_reply": "..." }] },
  "freeform_prompt": "What the agent would ask the user",
  "rationale": "one-liner for the activity stream"
}`;

function formatMemory(memory: AgentMemory | null): string {
	if (!memory) return "(no memory entries)";
	const lines: string[] = [];
	for (const e of memory.about) lines.push(`About: ${e.value}`);
	for (const e of memory.policies) lines.push(`Policy: ${e.value}`);
	return lines.join("\n") || "(no memory entries)";
}

export async function runReplyClassifier(
	env: Env,
	input: ReplyClassifierInput,
): Promise<ReplyClassifierResult> {
	const userMsg = `Agent: ${input.agent.name}. Voice: ${input.agent.voice ?? ""}
Signature to use on any reply: ${input.agent.signature ?? `— ${input.agent.name}`}

Mission brief:
"""
${input.missionBrief}
"""

User memory relevant to this mission:
${formatMemory(input.memory)}

Thread so far (most recent last):
${input.threadContext}

New inbound from ${input.inbound.from}:
Subject: ${input.inbound.subject ?? "(none)"}
Body:
"""
${input.inbound.body}
"""`;

	return callLLMJson<ReplyClassifierResult>(env, {
		model: MODEL_CLASSIFY,
		system: SYSTEM,
		cache_system: true,
		max_tokens: 900,
		temperature: 0.3,
		messages: [{ role: "user", content: userMsg }],
	});
}
