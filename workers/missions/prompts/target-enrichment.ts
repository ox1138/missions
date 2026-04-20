// Target enrichment prompt — per-target reasoning that combines the
// deterministic contact-behavior classifier with a short LLM judgment.
// This is where contact awareness becomes behavior.
// See docs/missions-prd.md § Contacts → "How contacts shape agent behavior".

import type { Env } from "../../types";
import { callLLMJson, MODEL_CLASSIFY } from "../services/llm";
import type { ContactRecommendation } from "../services/contact-ingest";

export interface TargetEnrichmentInput {
	missionBrief: string;
	targetName: string | null;
	targetEmail: string;
	targetContext: string | null; // why this target surfaced in research
	recommendation: ContactRecommendation; // from recommendContactBehavior
	historySummary: string; // from summarizeContactHistory
}

export type TargetEnrichmentAction =
	| "proceed_fresh"
	| "reference_prior"
	| "skip_declined"
	| "ask_ghosted"
	| "hold_active"
	| "skip_suppressed";

export interface TargetEnrichmentResult {
	action: TargetEnrichmentAction;
	reasoning: string; // short, will be written to the research log
	reference_hint?: string; // if reference_prior: what to reference in the opening line
}

const SYSTEM = `You are triaging a candidate target for an outreach mission. The contact system has already classified this target's prior history into a recommendation. Your job is to confirm or refine it with short reasoning.

The five actions:
- proceed_fresh — no prior contact. Send a first-touch email.
- reference_prior — prior warm/positive exchange exists. Open by referencing it naturally.
- skip_declined — they politely declined previously. Skip unless the new context is materially different.
- ask_ghosted — they ghosted after follow-ups. This is a legitimate unknown; escalate to the user.
- hold_active — an active thread is already in flight. Don't start a new one.
- skip_suppressed — hard suppression. Always skip.

Output:
{
  "action": one of the values above,
  "reasoning": "Short plain-language reasoning. One or two sentences max.",
  "reference_hint": "If action is reference_prior: a concise hint for the opening line, e.g. 'they mentioned they weren't booking past Q2 — new quarter might look different'. Otherwise omit."
}

Only override the given recommendation if you see a clear reason (e.g., the new mission's goal is materially different from the prior declined one). Otherwise stick with it.`;

export async function runTargetEnrichment(
	env: Env,
	input: TargetEnrichmentInput,
): Promise<TargetEnrichmentResult> {
	const userMsg = `Mission brief:
"""
${input.missionBrief}
"""

Candidate target:
- Name: ${input.targetName ?? "(unknown)"}
- Email: ${input.targetEmail}
- Context: ${input.targetContext ?? "(none)"}

Contact-system recommendation: ${input.recommendation}

Prior history summary:
${input.historySummary}`;

	return callLLMJson<TargetEnrichmentResult>(env, {
		model: MODEL_CLASSIFY,
		system: SYSTEM,
		cache_system: true,
		max_tokens: 400,
		temperature: 0.2,
		messages: [{ role: "user", content: userMsg }],
	});
}
