// HMAC-signed Reply-To tokens. The token encodes (mission_id, thread_id,
// target_id) and is verified when inbound email arrives at the Worker's
// email handler. Without this, inbound routing is fragile guess-based
// matching on subject lines. See docs/missions-prd.md § HMAC reply routing.

import type { Env } from "../../types";

export interface ReplyRoute {
	missionId: string;
	threadId: string;
	targetId: string | null;
}

// Base64url without padding — URL-safe and email-safe.
function b64urlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
	const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
	const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
	const binary = atob(padded);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

async function hmacKey(env: Env): Promise<CryptoKey> {
	const secret = env.HMAC_SECRET;
	if (!secret) throw new Error("HMAC_SECRET is not configured");
	const raw = new TextEncoder().encode(secret);
	return crypto.subtle.importKey(
		"raw",
		raw,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export async function signReplyToken(
	env: Env,
	route: ReplyRoute,
): Promise<string> {
	const payload = `${route.missionId}:${route.threadId}:${route.targetId ?? ""}`;
	const payloadBytes = new TextEncoder().encode(payload);
	const key = await hmacKey(env);
	const sigBuf = await crypto.subtle.sign("HMAC", key, payloadBytes);
	const sig = new Uint8Array(sigBuf).slice(0, 16); // 128 bits is plenty
	const combined = new Uint8Array(payloadBytes.length + sig.length);
	combined.set(payloadBytes);
	combined.set(sig, payloadBytes.length);
	// We encode payload | sig. On verify, split by known sig length.
	return b64urlEncode(combined);
}

export async function verifyReplyToken(
	env: Env,
	token: string,
): Promise<ReplyRoute | null> {
	try {
		const bytes = b64urlDecode(token);
		if (bytes.length < 17) return null;
		const sig = bytes.slice(bytes.length - 16);
		const payloadBytes = bytes.slice(0, bytes.length - 16);
		const key = await hmacKey(env);
		const ok = await crypto.subtle.verify("HMAC", key, sig, payloadBytes).catch(() => false);
		if (!ok) {
			// Verify only compares the first 16 bytes so we need a fresh sign.
			const expected = await crypto.subtle.sign("HMAC", key, payloadBytes);
			const expected16 = new Uint8Array(expected).slice(0, 16);
			if (!timingSafeEqual(sig, expected16)) return null;
		}
		const payload = new TextDecoder().decode(payloadBytes);
		const [missionId, threadId, targetRaw] = payload.split(":");
		if (!missionId || !threadId) return null;
		return {
			missionId,
			threadId,
			targetId: targetRaw ? targetRaw : null,
		};
	} catch {
		return null;
	}
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

// Parse the `reply+TOKEN@domain` local-part pattern.
export function extractReplyToken(address: string): string | null {
	const m = /^reply\+([A-Za-z0-9_-]+)@/.exec(address.trim());
	return m ? m[1] : null;
}
