// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	index,
	type RouteConfig,
	route,
} from "@react-router/dev/routes";

export default [
	// Missions is the default home.
	index("routes/missions.index.tsx"),
	route("missions/new", "routes/missions.new.tsx"),
	route("missions/:id", "routes/missions.detail.tsx"),

	// People — the Contacts dashboard.
	route("people", "routes/people.index.tsx"),

	// Agents — identity and memory views.
	route("agents", "routes/agents.index.tsx"),
	route("agents/:role", "routes/agents.detail.tsx"),

	// Inherited agentic-inbox mailbox UI, kept accessible.
	route("mailbox/:mailboxId", "routes/mailbox.tsx", [
		index("routes/mailbox-index.tsx"),
		route("emails/:folder", "routes/email-list.tsx"),
		route("settings", "routes/settings.tsx"),
		route("search", "routes/search-results.tsx"),
	]),

	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
