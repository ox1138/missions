// Outbound email send. Phase 4 will add HMAC-signed Reply-To routing and
// real delivery via the Workers send_email binding. For Phase 3 we implement
// the shape and the side-effects (message persistence + contact ingestion)
// so the workflow can run end-to-end with delivery mocked.

import type { Env } from "../../types";
import type { MissionDO } from "../mission-do";
import { DEFAULT_USER_ID } from "../index";
import { recordInteraction } from "./contact-ingest";
import { signReplyToken } from "./hmac";

export interface SendEmailInput {
	missionId: string;
	threadId: string;
	from: string;
	to: string;
	cc?: string;
	subject: string;
	body: string;
	agentId: string;
	targetId?: string;
}

export interface SendEmailResult {
	messageId: string;
	replyTo: string;
	delivered: boolean;
}

export async function sendEmail(
	env: Env,
	mdo: MissionDO,
	input: SendEmailInput,
): Promise<SendEmailResult> {
	const messageId = `<${crypto.randomUUID()}@${domainFromEmail(input.from)}>`;
	const replyTo = await buildReplyTo(env, input);

	// Persist the outbound message row.
	await mdo.addMessage({
		thread_id: input.threadId,
		direction: "out",
		from_addr: input.from,
		to_addr: input.to,
		cc: input.cc ?? null,
		subject: input.subject,
		body: input.body,
		sent_at: new Date().toISOString(),
		message_id: messageId,
		in_reply_to: null,
	});

	// Record the interaction in the cross-mission Contact log. This is the
	// non-negotiable step — see docs/missions-prd.md § Contacts.
	await recordInteraction(env, {
		userId: DEFAULT_USER_ID,
		agentId: input.agentId,
		missionId: input.missionId,
		email: input.to,
		type: "email_sent",
		summary: input.subject,
		metadata: { thread_id: input.threadId, message_id: messageId },
	});

	// Delivery. Priority order:
	//   1. Resend (works for any recipient if your domain is verified there)
	//   2. Workers `send_email` binding (CF Email Routing — pre-verified only)
	//   3. No-op fallback so local dev still "runs" without real delivery
	let delivered = false;
	try {
		if (env.RESEND_API_KEY) {
			delivered = await deliverViaResend(env, {
				from: input.from,
				to: input.to,
				cc: input.cc,
				subject: input.subject,
				body: input.body,
				messageId,
				replyTo,
			});
		} else {
			delivered = await deliverViaBinding(env, {
				from: input.from,
				to: input.to,
				cc: input.cc,
				subject: input.subject,
				body: input.body,
				messageId,
				replyTo,
			});
		}
	} catch (err) {
		console.warn(
			`[email-out] delivery failed for ${input.to}:`,
			(err as Error).message,
		);
		delivered = false;
	}

	return { messageId, replyTo, delivered };
}

// ── Delivery via Resend ──────────────────────────────────────────────

async function deliverViaResend(
	env: Env,
	d: DeliverInput,
): Promise<boolean> {
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: d.from,
			to: [d.to],
			cc: d.cc ? [d.cc] : undefined,
			subject: d.subject,
			text: d.body,
			reply_to: d.replyTo,
			headers: {
				"Message-ID": d.messageId,
			},
		}),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Resend ${res.status}: ${body}`);
	}
	return true;
}

function domainFromEmail(email: string): string {
	const at = email.indexOf("@");
	return at >= 0 ? email.slice(at + 1) : "invalid";
}

async function buildReplyTo(env: Env, input: SendEmailInput): Promise<string> {
	// HMAC-signed token encodes (mission_id, thread_id, target_id) so inbound
	// replies route back to the right MissionDO regardless of the recipient.
	const token = await signReplyToken(env, {
		missionId: input.missionId,
		threadId: input.threadId,
		targetId: input.targetId ?? null,
	});
	const domain = domainFromEmail(input.from);
	return `reply+${token}@${domain}`;
}

// ── Delivery via the Workers send_email binding ──────────────────────
// The binding accepts a MIME-formatted email. We build a minimal one here.
// Real production would use a full MIME builder (multipart, HTML) — MVP
// ships plain text only.

interface DeliverInput {
	from: string;
	to: string;
	cc?: string;
	subject: string;
	body: string;
	messageId: string;
	replyTo: string;
}

async function deliverViaBinding(env: Env, d: DeliverInput): Promise<boolean> {
	const binding = (env as unknown as { EMAIL?: unknown }).EMAIL;
	if (!binding) {
		// No binding configured — dev mode. We consider this "logged, not sent".
		return false;
	}

	const mime = buildMime(d);

	// The Workers EmailMessage type is not directly importable in type-safe
	// fashion without cloudflare:email-message. We use a runtime-dynamic send.
	// TypeScript-wise, we cast to a loose send() method.
	const emailCtor = (globalThis as unknown as {
		EmailMessage?: new (from: string, to: string, raw: string) => unknown;
	}).EmailMessage;
	if (!emailCtor) {
		// Runtime doesn't expose EmailMessage — fall back to no-op for dev.
		return false;
	}

	const msg = new emailCtor(d.from, d.to, mime);
	await (binding as { send: (m: unknown) => Promise<void> }).send(msg);
	return true;
}

function buildMime(d: DeliverInput): string {
	const date = new Date().toUTCString();
	const headers = [
		`From: ${d.from}`,
		`To: ${d.to}`,
		d.cc ? `Cc: ${d.cc}` : null,
		`Subject: ${escapeHeader(d.subject)}`,
		`Date: ${date}`,
		`Message-ID: ${d.messageId}`,
		`Reply-To: ${d.replyTo}`,
		`MIME-Version: 1.0`,
		`Content-Type: text/plain; charset="utf-8"`,
		`Content-Transfer-Encoding: 7bit`,
	]
		.filter(Boolean)
		.join("\r\n");
	return `${headers}\r\n\r\n${d.body}`;
}

function escapeHeader(s: string): string {
	// Very minimal — real code should encode non-ASCII via =?utf-8?b?...?=
	return s.replace(/\r?\n/g, " ");
}
