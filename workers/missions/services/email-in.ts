// Inbound email handler for the Missions layer. Detects `reply+<token>@...`
// addresses, verifies the HMAC, and routes the message to the right
// MissionDO instance. Falls through (returns false) for messages that
// aren't addressed to a missions reply-token so the base agentic-inbox
// mailbox handler can claim them.
//
// See docs/missions-prd.md § HMAC reply routing and § Risks → "Inbound
// email can't be routed to the correct mission".

import PostalMime from "postal-mime";
import type { Env } from "../../types";
import { verifyReplyToken, extractReplyToken } from "./hmac";

// ── Generic inbound webhook payload ─────────────────────────────────
// Shape accepted by the POST /api/v1/missions/inbound route. Compatible
// with common inbound-email providers (Postmark, CloudMailin, Mailgun,
// custom Resend-inbound integrations) once you map their payload to this
// minimal shape in the provider's webhook config.

export interface InboundWebhookPayload {
	from: string; // sender email
	to: string; // recipient email (must be reply+TOKEN@yourdomain)
	subject?: string | null;
	text?: string; // plaintext body (preferred)
	html?: string; // HTML fallback — stripped if text is empty
	cc?: string | null;
	messageId?: string | null;
	inReplyTo?: string | null;
}

export async function handleInboundWebhook(
	env: Env,
	payload: InboundWebhookPayload,
): Promise<{ ok: boolean; routed: boolean; reason?: string }> {
	const to = (payload.to ?? "").toLowerCase();
	const token = extractReplyToken(to);
	if (!token) return { ok: true, routed: false, reason: "no reply token in to-address" };

	const route = await verifyReplyToken(env, token);
	if (!route) return { ok: true, routed: false, reason: "invalid hmac" };

	const body =
		payload.text ??
		(payload.html ? stripHtml(payload.html) : "");

	const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(route.missionId));
	await stub.onInboundMessage({
		threadId: route.threadId,
		message: {
			from_addr: (payload.from ?? "").toLowerCase(),
			to_addr: to,
			cc: payload.cc ?? null,
			subject: payload.subject ?? null,
			body,
			sent_at: new Date().toISOString(),
			message_id: payload.messageId ?? null,
			in_reply_to: payload.inReplyTo ?? null,
		},
	});
	return { ok: true, routed: true };
}

export interface InboundRoute {
	missionId: string;
	threadId: string;
	targetId: string | null;
	from: string;
	subject: string | null;
	body: string;
	sentAt: string;
	messageId: string | null;
	inReplyTo: string | null;
	cc: string | null;
}

/**
 * Try to handle an inbound email as a Missions reply. Caller passes in the
 * already-buffered raw email so the same bytes can be replayed to the
 * base mailbox handler if Missions doesn't claim this message.
 * Returns true if the email matched the missions-reply pattern and was
 * routed (regardless of whether downstream processing succeeded). Returns
 * false if the email is not addressed to any missions reply-token — caller
 * should fall through to the next handler.
 */
export async function tryHandleMissionsInbound(
	rawEmail: Uint8Array,
	env: Env,
): Promise<boolean> {
	const parsed = await new PostalMime().parse(rawEmail);

	const recipients = [
		...(parsed.to ?? []).map((t) => t.address ?? ""),
		...(parsed.cc ?? []).map((t) => t.address ?? ""),
	]
		.map((a) => a.toLowerCase())
		.filter(Boolean);

	let tokenRecipient: string | null = null;
	let token: string | null = null;
	for (const addr of recipients) {
		const t = extractReplyToken(addr);
		if (t) {
			token = t;
			tokenRecipient = addr;
			break;
		}
	}

	if (!token) return false;

	const route = await verifyReplyToken(env, token);
	if (!route) {
		console.warn(
			`[missions/email-in] invalid/expired reply token for ${tokenRecipient}`,
		);
		// TODO Phase 5: write to a quarantine table and still create/update
		// a Contact so the history isn't lost.
		return true; // we claim this — invalid but clearly for missions.
	}

	const inbound: InboundRoute = {
		missionId: route.missionId,
		threadId: route.threadId,
		targetId: route.targetId,
		from: (parsed.from?.address ?? "").toLowerCase(),
		subject: parsed.subject ?? null,
		body: parsed.text ?? (parsed.html ? stripHtml(parsed.html) : ""),
		sentAt: new Date().toISOString(),
		messageId: parsed.messageId ? extractMsgId(parsed.messageId) : null,
		inReplyTo: parsed.inReplyTo ? extractMsgId(parsed.inReplyTo) : null,
		cc: (parsed.cc ?? [])
			.map((c) => c.address ?? "")
			.filter(Boolean)
			.join(", ") || null,
	};

	const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(route.missionId));
	await stub.onInboundMessage({
		threadId: route.threadId,
		message: {
			from_addr: inbound.from,
			to_addr: tokenRecipient ?? "",
			cc: inbound.cc,
			subject: inbound.subject,
			body: inbound.body,
			sent_at: inbound.sentAt,
			message_id: inbound.messageId,
			in_reply_to: inbound.inReplyTo,
		},
	});
	return true;
}

export async function streamToArrayBuffer(
	stream: ReadableStream,
	size: number,
): Promise<Uint8Array> {
	const result = new Uint8Array(size);
	const reader = stream.getReader();
	let offset = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		result.set(value, offset);
		offset += value.byteLength;
	}
	return result;
}

function extractMsgId(s: string): string {
	const m = s.match(/<([^>]+)>/);
	return m ? m[1] : s.trim().split(/\s+/)[0];
}

function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.trim();
}
