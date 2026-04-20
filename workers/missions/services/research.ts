// Research service — assembles a target list for a mission. MVP behavior:
// 1. Try Browser Run /crawl if BROWSER binding exists (stretch, not wired yet)
// 2. Fallback: ask the LLM to propose plausible candidates from the brief,
//    returning name + email + short rationale per candidate. The user can
//    verify addresses at the activity stream level before we send.
// 3. If PRESEEDED_TARGETS is in the mission.completion_condition metadata,
//    prefer that list — lets us pin targets for a reliable demo run.
//
// See docs/missions-prd.md § Scope → "Live web research via Browser Run" and
// § Triage order → "can fall back to pre-seeded target lists".

import type { Env } from "../../types";
import { callLLMJson, MODEL_CLASSIFY } from "./llm";

export interface ResearchCandidate {
	name: string;
	email: string;
	context: string; // why this candidate, one line
}

export interface ResearchInput {
	missionBrief: string;
	agentRole: "otto" | "mara" | "iris";
	targetCount: number | null;
	preseeded?: ResearchCandidate[];
}

export interface ResearchResult {
	candidates: ResearchCandidate[];
	source: "preseeded" | "llm" | "browser";
	notes: string; // written to the research log
}

export async function runResearch(
	env: Env,
	input: ResearchInput,
): Promise<ResearchResult> {
	if (input.preseeded && input.preseeded.length > 0) {
		return {
			candidates: input.preseeded,
			source: "preseeded",
			notes: `Pre-seeded ${input.preseeded.length} target(s) from mission metadata.`,
		};
	}

	// LLM fallback. Good enough for MVP; real Browser Run integration is a
	// Phase 2 product concern.
	return llmCandidates(env, input);
}

const SYSTEM = `You are the research head for an outreach agent. Given a mission brief, propose a short list of candidate people or organizations to reach out to.

For each candidate provide:
- name: the person or publication name
- email: the best-guess email address (use common patterns like host@podcast.com, first@company.com; do not fabricate specific names you cannot verify)
- context: one short sentence on why they match the brief

Rules:
- Propose at most the number of candidates the user asked for, or 5 if unspecified.
- Do NOT invent personal email addresses for specific named humans. Prefer public / generic addresses (host@, hello@, contact@) when the name is real but the email isn't known.
- If you cannot find good candidates for the brief, return an empty array.

Output JSON:
{
  "candidates": [{ "name": "...", "email": "...", "context": "..." }, ...],
  "notes": "One-line summary of the search strategy you used — written to the research log."
}`;

async function llmCandidates(
	env: Env,
	input: ResearchInput,
): Promise<ResearchResult> {
	const userMsg = `Agent role: ${input.agentRole}
Target count: ${input.targetCount ?? "up to 5"}

Mission brief:
"""
${input.missionBrief}
"""

Propose candidates.`;

	const parsed = await callLLMJson<{
		candidates: ResearchCandidate[];
		notes: string;
	}>(env, {
		model: MODEL_CLASSIFY,
		system: SYSTEM,
		cache_system: true,
		max_tokens: 1200,
		temperature: 0.5,
		messages: [{ role: "user", content: userMsg }],
	});

	return {
		candidates: parsed.candidates ?? [],
		source: "llm",
		notes: parsed.notes ?? "",
	};
}
