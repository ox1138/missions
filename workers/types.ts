// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;

	// Missions-specific secrets (local: .dev.vars; prod: wrangler secret put)
	ANTHROPIC_API_KEY: string;
	HMAC_SECRET: string;
}
