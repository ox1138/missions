// Outreach draft prompt — composes a single outbound email in Otto's voice
// using mission context, target context, user memory, and any prior contact
// history. First-touch emails MUST include "I'm [name]'s agent" framing.
// See docs/missions-prd.md § Agents → Otto, § Design principles → voice.

import type { Env } from "../../types";
import { callLLMJson, MODEL_DRAFT } from "../services/llm";
import type { AgentIdentity, AgentMemory } from "../agent-do";

export interface OutreachDraftInput {
	missionBrief: string;
	userName: string;
	userEmail: string;
	agent: Pick<AgentIdentity, "name" | "voice" | "signature" | "bio" | "email_local_part">;
	agentEmail: string; // e.g. otto@missions.polen.so
	memory: AgentMemory | null;
	target: {
		name: string | null;
		email: string;
		context: string | null;
	};
	contactHistorySummary: string;
	referenceHint?: string; // from target-enrichment when reference_prior
	researchNotes: string; // compacted research log relevant to this target
	isFirstTouch: boolean;
}

export interface OutreachDraftResult {
	subject: string;
	body: string;
}

function formatMemory(memory: AgentMemory | null): string {
	if (!memory) return "(memory not yet populated)";
	const fmt = (label: string, entries: { value: string }[]) =>
		entries.length ? `${label}:\n${entries.map((e) => `  • ${e.value}`).join("\n")}` : "";
	return [
		fmt("About the user", memory.about),
		fmt("Policies", memory.policies),
		fmt("Topics of interest", memory.topics),
	]
		.filter(Boolean)
		.join("\n");
}

const SYSTEM_TEMPLATE = (agent: OutreachDraftInput["agent"]) => `You are ${agent.name}, an email correspondent agent working on behalf of a real person. Your job is to reach out to specific people toward a specific goal, and to introduce your human into the thread once it warms up.

Your voice: ${agent.voice ?? "Warm but efficient. Short sentences."}
Your bio: ${agent.bio ?? ""}
Your signature: ${agent.signature ?? `— ${agent.name}`}

Principles you follow when drafting:
- You are an agent. Say so. In a first-touch email, always include a short, natural acknowledgement that you are the user's agent (e.g. "I'm Luke's agent, writing on his behalf."). Do not pretend to be the user.
- Short emails. Two to four short paragraphs. No filler.
- Reference concrete details. If there is prior history or research, mention it naturally. No fabrication — if you don't have a fact, don't invent it.
- Do not apologise for writing or for being an agent. It is respectful; it is not a trespass.
- Never claim meetings, calendars, budgets, or other specifics unless given as a policy the user set.
- Do not use marketing language. No "circling back", no "I hope this finds you well". No exclamation marks unless the voice guide explicitly allows them.
- Sign with the signature above.

Output a single JSON object:
{
  "subject": "Short, specific, not gimmicky. Under 70 chars.",
  "body": "Plain text email body. Include the signature at the end. Use \\n for line breaks."
}`;

export async function runOutreachDraft(
	env: Env,
	input: OutreachDraftInput,
): Promise<OutreachDraftResult> {
	const system = SYSTEM_TEMPLATE(input.agent);

	const userMsg = `Mission brief:
"""
${input.missionBrief}
"""

User: ${input.userName} <${input.userEmail}>
Agent sends from: ${input.agentEmail}

User memory (what you already know about them):
${formatMemory(input.memory)}

Target:
- Name: ${input.target.name ?? "(unknown — best guess from email)"}
- Email: ${input.target.email}
- Context for why we're reaching out: ${input.target.context ?? "(inferred from mission brief)"}

Prior contact history:
${input.contactHistorySummary}
${input.referenceHint ? `\nOpening-line hint from triage: ${input.referenceHint}\n` : ""}
Research notes:
${input.researchNotes || "(no additional research)"}

Task: Draft ${input.isFirstTouch ? "a first-touch email" : "a follow-up email"} from ${input.agent.name} to this target.`;

	return callLLMJson<OutreachDraftResult>(env, {
		model: MODEL_DRAFT,
		system,
		max_tokens: 900,
		temperature: 0.7,
		messages: [{ role: "user", content: userMsg }],
	});
}
