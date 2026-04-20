// Understand prompt — parses a user's mission brief into a structured plan.
// For clear briefs, outputs a one-sentence interpretation and a plan the
// workflow will act on. For genuinely ambiguous briefs, outputs a single
// specific clarifying question. See docs/missions-prd.md § Approval model:
// "the understand phase is not an approval gate" for clear briefs.

import type { Env } from "../../types";
import { callLLMJson, MODEL_CLASSIFY } from "../services/llm";

export interface UnderstandInput {
	brief: string;
	agentRole: "otto" | "mara" | "iris";
	userName?: string;
}

export type UnderstandResult =
	| {
			clear: true;
			interpretation: string;
			plan: {
				goal: string;
				target_count: number | null;
				target_criteria: string;
				completion_signal: string;
			};
	  }
	| {
			clear: false;
			clarifying_question: string;
	  };

const SYSTEM = `You are the planning head for the Missions product — a tool that assigns long-running goals to AI agents who work over days or weeks via email.

You are given a brief the user has just written for their agent. Your job is to decide whether the brief is clear enough for the agent to start working immediately, OR whether it is genuinely ambiguous in a way that blocks the very first action.

STRONG BIAS: err toward "clear". Most briefs are clearer than they seem. Only flag as ambiguous if the agent would literally not know what to look for — not if the brief is merely short. "Get me booked on 3 podcasts about AI and creative work" is CLEAR even though tone, host list, and timing are not specified — those can be decided during research.

If clear, output:
{
  "clear": true,
  "interpretation": "One sentence restating what the agent will do. Written like a note the agent scribbles to itself.",
  "plan": {
    "goal": "Concrete goal in one short clause",
    "target_count": number or null,
    "target_criteria": "What makes a good target",
    "completion_signal": "How we will know we're done"
  }
}

If genuinely ambiguous, output:
{
  "clear": false,
  "clarifying_question": "A single specific question. Not 'can you clarify' — a targeted question whose answer unblocks the first research step."
}`;

export async function runUnderstand(
	env: Env,
	input: UnderstandInput,
): Promise<UnderstandResult> {
	const userMsg = `Agent role: ${input.agentRole}
User name: ${input.userName ?? "unknown"}

Brief:
"""
${input.brief}
"""`;

	return callLLMJson<UnderstandResult>(env, {
		model: MODEL_CLASSIFY,
		system: SYSTEM,
		cache_system: true,
		max_tokens: 600,
		temperature: 0.2,
		messages: [{ role: "user", content: userMsg }],
	});
}
