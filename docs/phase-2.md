# Missions — Phase 2 Plan

Everything deferred from the Otto-only MVP that shipped in Phases 0–7, plus items surfaced during the build that the PRD didn't explicitly cover. Ordered loosely by the value it delivers per unit of effort.

---

## A. Mission-level reasoning (net-new, biggest upgrade)

The MVP classifier is **thread-scoped**: it decides what Otto should do on *this conversation*. It does not reason about the mission as a whole. For complex briefs — multi-sub-goal, discovery-shaped, or chained — Otto can close a thread "gracefully" while leaving the real mission objective unmet.

**What to build:**

1. **Mission reviewer prompt.** After each thread-level action lands, run a secondary LLM call with: the brief, the plan (from `understand`), all current thread statuses and summaries, and the latest reply. Output a structured decision: `{ status: "on_track" | "blocked" | "complete", unmet_sub_goals: string[], implied_new_targets: Candidate[], reasoning: string }`.
2. **Act on the reviewer output.** `complete` → set mission phase to `complete`. `implied_new_targets` → raise a multi-choice approval to add them (same plumbing as the Phase 7 referral detection). `blocked` → freeform approval asking the user how to proceed.
3. **Mission phase for this:** add `mission_reviewer.reviewed` activity event after each reply cycle. Cache the last reviewer output on the mission row so the UI can show "what Otto currently believes about the mission."

**Effort:** ~1 day. One new prompt, one new workflow hook, wiring into the existing approval system.

**Acceptance:** the test case that motivated it — "email Lori, ask about the flu and the party address; she says she's not going and redirects to Luke" — should result in Otto silently adding Luke as a new target (via referral detection already) AND the mission reviewer flagging "address sub-goal unmet pending Luke's reply" instead of closing.

---

## B. Deferred from the MVP plan

From the original plan's "Explicitly deferred" list — all still outstanding:

1. **Mara's full flow** — researcher agent, no outreach, delivers a structured brief. Re-uses: understand + research prompts, plus a new synthesis prompt. Ends with user marking the brief accepted.
2. **Iris's full flow** — watcher agent, polls web sources via `scheduleEvery`, compares against prior state, sends update emails. Never "completes" — runs until cancelled.
3. **Dedicated People view UI** — the Contact entity + behavior already ships. The `/people` route has a minimal list with suppression; full profile pages with the per-contact timeline and notes editing are not built.
4. **Memory editing UI** — memory is stored and read-only-rendered in `/agents/:role`. Edit forms per section (About / Policies / Topics) need to be built, with the `missionsApi.updateAgentMemory` endpoint already wired on the backend.
5. **Onboarding questionnaire** — for memory seeding at first-run. Currently memory is empty until the user manually adds entries.
6. **Agent-proposed memory additions** — after missions complete, agents propose entries for the user to approve. Not built.
7. **Mission archive / search** — UI for browsing completed missions. Today, completed missions still appear in the dashboard's "Completed" section but there's no search across them.
8. **Multi-user auth** — the app hardcodes `DEFAULT_USER_ID = "default"` and bootstraps a single user. Real multi-user would key UserDO by the authenticated email from the CF Access JWT.
9. **Pause / resume / redirect / edit-brief primitives** — `pause` and `cancel` endpoints exist; `redirect` (change target list mid-flight) and `edit-brief` don't. Needed for "the ongoing steering layer" the PRD mentions.

---

## C. Deliverability and production-readiness

The MVP sends real email but has no reputation yet. Early sends land in Gmail spam. Items:

1. **Deliverability warm-up protocol.** New sending domains need gradual volume ramp; hammering from 0→50 sends/day from a fresh cf-bounce subdomain triggers spam classifiers. Possible: explicit daily cap on the worker, daily-send counters per mission, user-visible "warming up — X/Y sends today" badge.
2. **Bounce rate monitoring.** If N consecutive sends bounce, auto-pause affected missions. Today we just log and move on.
3. **DMARC report monitoring.** CF adds a DMARC record but we don't read the reports. Wire up a receiver for aggregate reports to surface deliverability trends.
4. **Feedback loop registration.** Gmail/Outlook feedback loops so spam flags automatically suppress the contact.
5. **Full MIME (HTML) builder.** Current `textToHtml` is a crude paragraph wrap. Build a small HTML email template (header with agent name, signature block, minimal CSS) so messages look less robotic in HTML-capable clients. Keep plaintext fallback.

---

## D. Reply routing robustness

Phase 4 reply routing works but has edge cases:

1. **Quarantine table for invalid tokens.** Today, an inbound to `reply+unknowntoken@...` is logged and dropped. Per the PRD "fallback creates a Contact even for unrouted messages so history is preserved" — persist it to a quarantine table on UserDO, create/update the Contact, and raise an approval for the user to route manually.
2. **Token expiry.** Reply tokens live forever in `reply_tokens`. A long-running deployment will grow the table unbounded. Add a TTL (e.g. 90 days post-last-activity) and a scheduled cleanup job.
3. **Handle inbound from multiple destinations on one thread.** CF Email Routing delivers exactly one address per inbound; but some threads get a reply to `otto@` (not `reply+TOKEN@`) when recipients strip tagged addresses. Fall back to matching by In-Reply-To + sender email against the existing `messages` rows.
4. **Inbound handles cc'd user correctly.** The PRD handoff flow cc's the user. If the user replies-all, their reply arrives at the `reply+TOKEN@` AND the user's own address. Need to ignore messages where the `from` is the user's own domain.

---

## E. Scheduling and follow-ups

The MVP has silent-confirm alarms for handoff but nothing else:

1. **Automatic follow-ups.** "If no reply in 7 days, send follow-up." Uses the existing `scheduleTask` mechanism. Needs a `followup-draft` prompt and caps (max 2 follow-ups per thread before Otto parks it).
2. **Handoff reminders.** "24 hours after handoff, check if the user replied." If not, email the user a nudge.
3. **Mission stall detection.** "If no state change in 48 hours, flag for user review." Existing risk row from the PRD. Implement as a scheduled task on each MissionDO that cancels itself whenever activity fires.
4. **User-tunable windows.** Silent-confirm windows, follow-up intervals, reminder cadence — expose on the mission workspace and agent profile.

---

## F. Agent identity editing

Currently read-only in the UI. Backend endpoints exist (`PATCH /api/v1/missions/agents/:role`).

1. Form per agent: name, bio, voice guide, signature, email local-part, avatar.
2. Editing the email local-part while a mission is mid-flight — decide policy: reject, or silently use old local-part until mission completes.
3. Voice and signature changes apply to **future** actions only — documented in the UI.

---

## G. Observability

The PRD section 7 mentions Agents SDK v0.7 `diagnostics_channel` events published to seven named channels. The MVP logs to `mdo.logActivity()` only.

1. Wire the seven PRD events (`mission.created`, `mission.phase_changed`, `approval.*`, `email.*`, `research.*`, `memory.*`, `contact.*`) into `diagnostics_channel.channel(...)` alongside the activity-stream write.
2. Tail Worker for production monitoring.
3. Optional: a debug sub-tab per mission that shows the raw diagnostic events in addition to the human-readable activity stream.

---

## H. Stretch: Live web research via Browser Run

Phase 3 falls back to LLM-proposed candidates when no `preseeded` list is supplied. Real research via `Browser Run /crawl` isn't wired yet.

1. `services/research.ts` already has a shape for it; call the `BROWSER` binding and crawl a few search pages from the brief.
2. Ranking prompt on the collected content to pick the top N candidates per target criteria.
3. Cache crawled pages in R2 so subsequent missions with overlapping targets don't re-fetch.

---

## I. Documentation + repo hygiene

1. Update the repo's `README.md` — currently still the inherited agentic-inbox copy. Replace with a Missions-first intro that links to the PRD + SETUP.md.
2. Publish the 90-second film called for in the MVP deliverables.
3. Write the architecture blog post (the one the MVP launch plan mentioned).
4. Open-source the repo publicly (currently forked publicly but no fanfare yet).

---

## Non-goals for Phase 2 explicitly

- Custom user-created agent types. Stay at three roles (Mara, Otto, Iris) until we have real user traction.
- Team / shared missions. Still Luke-alone.
- Integrations beyond email. No LinkedIn, SMS, calendar.
- Billing, paid tiers. Not until there's a product.

---

## Order of operations if continuing autonomously

1. A (mission reviewer) — biggest leverage, addresses the flaw Luke just spotted.
2. D.1 and D.4 (quarantine + user-cc handling) — small, production-safety.
3. E.1 (follow-ups) — unlocks missions that need more than one touch.
4. B.4 (memory edit UI) — smallest leverage but closes a PRD promise.
5. Then Mara (B.1), then Iris (B.2).
