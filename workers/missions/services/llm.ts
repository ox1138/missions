// Tiny Anthropic client. Deliberately minimal — we control prompt structure
// tightly, and the Vercel AI SDK adds surface area we don't need here.
// Caching headers are set so frequently-reused system prompts can hit the
// prompt cache on subsequent calls within 5 minutes.

import type { Env } from "../../types";

// Default model choices. Drafting (Otto's emails, handoff) uses Sonnet for
// quality; classification/triage (reply classifier, brief understanding,
// target enrichment, research synthesis) uses Haiku for speed and cost.
export const MODEL_DRAFT = "claude-sonnet-4-6";
export const MODEL_CLASSIFY = "claude-haiku-4-5-20251001";

export interface LLMMessage {
	role: "user" | "assistant";
	content: string;
}

export interface LLMCallOptions {
	model?: string;
	system?: string;
	messages: LLMMessage[];
	max_tokens?: number;
	temperature?: number;
	cache_system?: boolean;
}

export interface LLMResponse {
	text: string;
	input_tokens: number;
	output_tokens: number;
	stop_reason: string;
}

export async function callLLM(
	env: Env,
	opts: LLMCallOptions,
): Promise<LLMResponse> {
	const body: Record<string, unknown> = {
		model: opts.model ?? MODEL_DRAFT,
		max_tokens: opts.max_tokens ?? 1024,
		temperature: opts.temperature ?? 0.7,
		messages: opts.messages,
	};

	if (opts.system) {
		if (opts.cache_system) {
			body.system = [
				{
					type: "text",
					text: opts.system,
					cache_control: { type: "ephemeral" },
				},
			];
		} else {
			body.system = opts.system;
		}
	}

	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": env.ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Anthropic API error ${res.status}: ${text}`);
	}

	const json = (await res.json()) as {
		content: Array<{ type: string; text?: string }>;
		usage: { input_tokens: number; output_tokens: number };
		stop_reason: string;
	};

	const text = json.content
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("");

	return {
		text,
		input_tokens: json.usage.input_tokens,
		output_tokens: json.usage.output_tokens,
		stop_reason: json.stop_reason,
	};
}

// JSON-mode helper. Instructs the model to return JSON only, then parses.
// If parsing fails, retries once with a correction hint.
export async function callLLMJson<T = unknown>(
	env: Env,
	opts: LLMCallOptions,
): Promise<T> {
	const systemWithJson = `${opts.system ?? ""}

CRITICAL OUTPUT RULES:
- Respond with a single valid JSON object. Nothing else.
- No markdown code fences. No prose before or after. No explanations.
- The outer object must match the schema the user describes.`.trim();

	let attempt = 0;
	let lastError: unknown = null;
	while (attempt < 2) {
		const res = await callLLM(env, { ...opts, system: systemWithJson });
		try {
			// Be tolerant of accidental code fences if the model wraps anyway.
			const cleaned = res.text
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			return JSON.parse(cleaned) as T;
		} catch (err) {
			lastError = err;
			attempt++;
		}
	}
	throw new Error(
		`LLM returned non-JSON after retries: ${(lastError as Error).message}`,
	);
}
