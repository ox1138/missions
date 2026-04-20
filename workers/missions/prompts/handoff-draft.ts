// Handoff draft prompt — the moment Otto introduces the user into a warm
// thread and steps back. Handoff emails include the user in the cc/to.
// See docs/missions-prd.md § Mission lifecycle → handoff.

import type { Env } from "../../types";
import { callLLMJson, MODEL_DRAFT } from "../services/llm";
import type { AgentIdentity } from "../agent-do";

export interface HandoffDraftInput {
	agent: Pick<AgentIdentity, "name" | "voice" | "signature" | "bio">;
	agentEmail: string;
	userName: string;
	userEmail: string;
	missionBrief: string;
	recipient: { name: string | null; email: string };
	threadContext: string; // last few messages stringified
}

export interface HandoffDraftResult {
	subject: string;
	to: string; // recipient email
	cc: string; // user's email — they get looped in
	body: string;
}

const SYSTEM_TEMPLATE = (agent: HandoffDraftInput["agent"]) => `You are ${agent.name}, an email correspondent agent. You are about to hand off a warm thread to your human so they can take it over directly.

Your voice: ${agent.voice ?? "Warm but efficient."}
Your signature: ${agent.signature ?? `— ${agent.name}`}

The handoff email is the one significant moment where you formally step back. Principles:
- Short. Three paragraphs at most.
- Address the recipient directly — you've been talking to them for a while, this is not a first touch.
- Acknowledge the warmth / progress so far concretely (reference what they said).
- Introduce the user by name and cc them. Make it clear the user will reply from here on.
- Thank the recipient briefly for their patience talking to an agent.
- Sign with your signature. Do not use the user's signature.

Output JSON:
{
  "subject": "Usually keep the existing subject or add 'handoff' only if natural",
  "to": "recipient email",
  "cc": "user email",
  "body": "plain text, \\n for line breaks, ending with signature"
}`;

export async function runHandoffDraft(
	env: Env,
	input: HandoffDraftInput,
): Promise<HandoffDraftResult> {
	const system = SYSTEM_TEMPLATE(input.agent);

	const userMsg = `User being introduced: ${input.userName} <${input.userEmail}>
Agent email (from): ${input.agentEmail}
Recipient: ${input.recipient.name ?? "(unknown)"} <${input.recipient.email}>

Mission brief (internal context, not to be quoted verbatim):
"""
${input.missionBrief}
"""

Thread so far (most recent last):
${input.threadContext}

Draft the handoff email now. The 'to' is the recipient, the 'cc' is the user, and the subject should continue the thread.`;

	return callLLMJson<HandoffDraftResult>(env, {
		model: MODEL_DRAFT,
		system,
		max_tokens: 700,
		temperature: 0.6,
		messages: [{ role: "user", content: userMsg }],
	});
}
