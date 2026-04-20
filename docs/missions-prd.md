# Missions — Product Requirements Document

> Missions is a web app where users define goals in plain language and assign them to an agent. The agent runs the mission — researches, writes emails, handles replies — over days or weeks, asking the user to approve key moments. Missions end when the goal is achieved or when the agent hands off a warm conversation to the user. Built on Cloudflare Workers, Durable Objects, Email Service, and the Agents SDK.

---

## Problem

Individuals with small networks and outbound goals face a consistent failure mode: the research, writing, and follow-through required to reach a small number of specific people is too expensive to do well, and too important to delegate badly. Current tools solve the wrong version of this problem. AI SDR platforms optimize for volume and conversion rate — they assume a sales team, a CRM, and a pipeline. Personal assistants handle one-off tasks but don't run multi-week projects. Neither is designed for someone who wants to get booked on three specific podcasts, or find one specific contractor, or get introduced to one specific person at a company.

This matters now because the infrastructure to solve it properly exists for the first time. Durable agents with their own email addresses can pursue a goal over weeks, handle inbound asynchronously, and ask for help at the right moments. The primitive is new. The product category isn't.

## Goals and non-goals

| Goals | Non-goals |
|---|---|
| Run long-duration missions (days to weeks) with clear goals and clear completion conditions | High-volume outbound (>100 targets per mission) |
| Make every agent action visible and reversible | Impersonate the user — every outbound email is signed as an agent |
| Scale from one user (demo) to many users without re-architecting | Build signup flows, billing, team features in v1 |
| Support three distinct mission shapes (research, outreach, monitoring) with one agent engine | Support arbitrary workflows beyond the three shapes |
| Let users edit agent identity, memory, and mission parameters mid-flight | Let users write the agent's core logic or prompt templates |
| Remember every person the user's agents have contacted, across all missions and all time | Build a full sales CRM with pipelines and deal stages |
| Feel like a trusted colleague, not a tool | Feel like an inbox |

## Success metrics

Because this product ships first as a demo and then as a small product, measure at both scales.

**Demo (Cloudflare Agent Day audience):**
- At least one mission runs end-to-end during the demo window with no human intervention in the backend
- The film produced from the demo generates public discussion (reshares, responses, quote-tweets) within a week
- At least one viewer attempts to fork or deploy the project within a month

**Product (first 100 users):**
- 50% of users who create a mission see it reach `handoff` or `complete` state (not abandoned)
- Median mission duration between 3 and 21 days — shorter means the product is trivial, longer means agents are stuck
- Users create a second mission within 14 days of completing their first (retention signal)
- User-edited drafts are sent in more than 60% of cases (signal that drafts are useful but not yet perfect)

## Users

**Primary.** An individual operator with a real network but not a big one. Founder, solo consultant, creative freelancer, researcher. They have goals that require specific people to respond, not just any people. They do this work now, but inconsistently, because the emotional and time cost of cold outreach drains them.

**Secondary.** Small teams (2–5 people) who share an agent and coordinate missions. Deferred to v2.

**Not a target user.** Sales teams, recruiters running open reqs, marketers running campaigns. These users have needs that AI SDR products already serve well. Our product is a worse fit because our missions are scoped to specific goals with completion conditions, not quotas.

## Agents

The product ships with three agents. Each represents a distinct role, not a personality. Users cannot create new agents in v1 — the three roles cover the full space of mission shapes we support.

### Mara — the researcher

Mara runs missions that end with a deliverable, not a relationship. She searches the web, reads pages, synthesizes notes, and returns a brief. She does not send emails to third parties.

Typical mission: *"Research 10 companies working on spatial computing and give me a brief on each."* Mara crawls, reads, ranks, and delivers a structured report. The mission ends when the report is delivered and the user marks it useful.

Mara's voice is precise, compressed, slightly dry. Her reports lead with findings and put methodology in footnotes.

### Otto — the correspondent

Otto runs missions that require writing to real people and working toward a warm handoff. He composes outreach, handles replies, negotiates small questions, and eventually introduces the user into the thread as a peer.

Typical mission: *"Get me booked on 5 podcasts about AI and creative work."* Otto finds candidates, writes to each host in turn, fields their questions, and when a host is ready to book, sends a handoff email that loops the user in.

Otto's voice is warm but efficient. He introduces himself as an agent in every first-touch email. He is comfortable writing questions back to people when unsure.

### Iris — the watcher

Iris runs open-ended monitoring missions. She watches the web for a specific signal and emails the user when something changes. She does not work toward a completion condition — she works until dismissed.

Typical mission: *"Tell me when any of these 5 companies raises funding, changes its CEO, or makes a big announcement."* Iris polls, compares against previous state, and sends the user a short email whenever something triggers.

Iris's voice is minimal. A line or two per update. She does not embellish. She can be told to be more or less chatty.

### Agent identity editing

Users can edit each agent's:

- Display name (used as the sender name and in the UI)
- Email local-part (becomes `<name>@<user-domain>`)
- Bio / role description (visible to the user, influences the agent's self-description in outbound emails)
- Voice guide (short instructions, e.g. "dry, slightly British, never uses exclamation marks")
- Signature line (appended to outbound emails, e.g. "— Otto, on behalf of Luke at Polen")
- Avatar (uploaded image or initials-generated)

Users cannot edit:

- The agent's role (researcher, correspondent, watcher). Roles are the contract; changing them would break expectations.
- The agent's core prompts and behavior. These are managed by the product.

Editing is allowed at any time, including mid-mission. Changes to voice and signature apply to future actions, not past ones.

## Memory

Each agent has a memory file. The memory is a structured, editable document the agent maintains across all its missions for a given user. It is the agent's long-term context.

### What memory contains

- Facts about the user (name, location, work, preferences)
- Policies (e.g. "user doesn't pay for podcast appearances", "user prefers intros via warm friends, not cold")
- Learned preferences (e.g. "user edits out exclamation marks; keep them minimal")
- People and relationships (e.g. "James Beattie — old colleague, works at X, friendly")
- Topics of interest (informs what the agent pays attention to)

Memory is agent-scoped. Mara's memory is not Otto's memory. This is deliberate: different agents accumulate different knowledge based on what they do.

### How memory is populated

- Seeded at user onboarding with a short questionnaire
- Updated by the agent itself after missions (agent proposes additions, user approves)
- Editable directly by the user at any time

### How memory is visible

A dedicated view per agent showing the memory as a readable document. Sections: About me, Policies, Topics. Each entry has a source and a timestamp. User can edit, delete, or mark entries as "don't forget this."

This is a first-class artifact of the product, not a hidden feature. Users see exactly what the agent believes about them. This is the trust layer.

### Research log vs memory vs contacts

Three different persistence layers, each with a different scope:

- **Memory** — long-lived, cross-mission, agent-scoped. Facts and preferences about the user. "User doesn't pay for podcasts." "User prefers short emails."
- **Research log** — short-lived, mission-scoped. What the agent learned while running this specific mission. "Cortex Futura publishes biweekly, host is Brussels-based." Relevant while the mission is active; less so once it's over.
- **Contacts** — long-lived, cross-mission, user-scoped (shared across all agents). Every real person any agent has interacted with, and the outcome of those interactions.

All three are editable by the user. The agent can promote items between them — e.g. "I learned the user lives in Lisbon during this mission — should I remember this in memory?"

## Contacts

Every real person the user's agents have corresponded with, researched, or monitored is tracked as a Contact. This is the product's cross-time memory of the user's network as their agents help build it up.

### Why contacts exist as a separate concept

Without a shared contact layer, agents treat every new mission as a blank slate. Otto emails Mathew at Cortex Futura in March asking about a podcast appearance. Mathew doesn't reply. In May, a new mission turns up Cortex Futura again. Otto drafts a fresh first-touch email: "Hi Mathew, I'm Otto, Luke's agent..." Mathew opens this second email having already ignored the first one a few weeks ago. The relationship is worse than if Otto had never emailed at all.

This scenario will happen the moment the product handles more than one mission in the same domain. Contacts prevent it by giving agents a shared memory of "who have we talked to, when, and how did it go?"

### What Contacts track

For each person:
- Email, name, any role/context the agents have learned
- First interaction, last interaction, total interactions
- Outcome history — every thread with this person, its resolution, duration
- Notes — a short running summary the agents maintain about the relationship
- Sources — which missions, which agents have touched this contact

Contacts are user-scoped (not agent-scoped). Mara, Otto, and Iris all read from the same Contact record. If Mara researches Mathew for a Lisbon-adjacent timber mission, then Otto later wants to reach out to Mathew for a podcast mission, Otto sees everything Mara has learned plus any prior outreach history.

### How contacts shape agent behavior

When Otto's research phase surfaces a target, the system first checks Contacts. If a Contact record exists, Otto sees the history and factors it into his behavior. The rules:

- **Previous thread was warm or positive, even if not converted.** Otto references the previous exchange openly. Example draft opening: *"Last time we spoke you mentioned you weren't booking past Q2 — your calendar might look different now. Here's why I thought of you again."* This matches how a good human networker operates.
- **Previous thread resulted in a polite decline.** Otto skips this target by default. He flags it in the research log with a note: *"Declined in March when we asked about X. Skipping unless you want me to try again."* The user can override.
- **Previous thread was ghosted (sent, never replied after follow-ups).** Otto escalates as a multi-choice approval: "I want to email Mathew again for this mission. Last time he didn't reply after two follow-ups. Options: try again with a fresh angle / skip / let me see the previous thread first." This is a legitimate block — Otto genuinely doesn't know the right call.
- **Previous thread is still active (we're mid-conversation).** Otto does not start a new thread. Either the new ask is folded into the existing thread (if the context fits), or Otto flags for the user and holds.
- **Contact exists but only from research or monitoring (no outreach history).** Otto emails as normal but has richer context from prior research. First-touch email can reference things the agents already know.

### How contacts are visible to the user

A top-level **People** view, parallel to the mission dashboard. Lists everyone across all missions. Sortable by last interaction, filterable by outcome. Each row shows: name, last contact date, number of interactions, last outcome, which agents have touched them.

Clicking a person opens their profile: full interaction history (every email, every mission, every note), with the ability to add manual notes and edit the running summary.

The contact summary is also surfaced inline during a mission's research phase. When Otto's target list is being assembled, each candidate shows a contact badge: "New", "Previously emailed — 1 month ago, no reply", "Previously booked", etc. Otto's drafting prompt receives the full summary for any known contact.

### Inbound emails also create Contacts

When someone replies to an agent's outreach, or when someone emails an agent cold, a Contact record is created or updated. Even people who contact the user's agents without being part of a mission get tracked.

This is the product's long-term network graph: every real exchange, every direction, every agent, every mission, rolled up per person.

### Privacy and data minimization

Contacts store only what's necessary for the agents to behave correctly — email addresses, names, basic role context, interaction history. No third-party data enrichment without explicit user action. No social graph scraping. No data sold or shared.

Contacts are user-owned and deletable. Users can delete individual contacts, delete all contacts for a specific mission, or export their entire contact history as JSON.

If an agent is asked by a recipient to stop contacting them, that contact is marked as suppressed. No future mission can email a suppressed contact, regardless of the brief.

## User stories

| # | As a... | I want to... | So that... | Acceptance criteria |
|---|---|---|---|---|
| 1 | User | Create a mission with a plain-language brief and walk away | I don't need to be involved unless something requires me | Mission creation is a single text field + agent selector; agent begins work immediately without further user input for clear briefs |
| 2 | User | See what the agent is doing in real time | I trust what's happening on my behalf | Each mission has a live activity stream that updates without page refresh; every sent email is logged with full content visible |
| 3 | User | Take over a thread when I want to handle it personally | I can intervene without needing to pre-approve everything | Thread drawer has a "take over" action that stops the agent and lets the user reply directly |
| 4 | User | Have the agent handle most replies without asking me | missions save time instead of demanding it | Reply classifier routes positive / negative / known-question replies to automatic handling; only unknown-question and ambiguous replies escalate |
| 5 | User | Respond to an agent's open question with a freeform answer | the agent can handle situations it doesn't have context for | Freeform-response approval is available when agent hits an unknown; user's answer is integrated into the reply |
| 6 | User | Be given a window to intervene before significant agent actions | I stay informed without being interrupted | Silent-confirm approvals show proposed action + countdown; auto-proceed if no response within window; handoffs use a 2-hour window |
| 7 | User | Never accidentally re-email someone my agents already contacted | I don't burn relationships through forgetfulness | Research phase checks Contacts; agents reference prior threads in new drafts or skip/ask based on prior outcome |
| 8 | User | See every person my agents have contacted across all missions | I have a shared record of my network | Top-level People view lists all contacts, sortable and filterable; clicking any contact shows full interaction history |
| 9 | User | Mark a contact as "do not email" | I can honor unsubscribes and personal preferences | Contacts can be suppressed; suppressed contacts are excluded from all future mission target lists regardless of brief |
| 10 | User | Read the research log for any mission | I understand what the agent learned and can correct mistakes | Research log is visible per mission, chronological, editable |
| 11 | User | Read and edit the agent's memory | the agent's long-term context is mine to shape | Each agent has a memory view; all entries are user-editable |
| 12 | User | Pause or redirect a mission mid-flight | I can change my mind without starting over | Mission header has pause / resume / edit-brief / kill actions |
| 13 | User | Receive a handoff email that loops me into a warm thread | I take over relationships at the right moment | Handoff emails include the user in the to/cc line and are marked as handoff in the UI |
| 14 | User | Customize an agent's name, voice, and signature | the agent writes in a way I'd endorse | Identity editing form per agent; changes apply to future actions |
| 15 | User | See all my missions in one place | I know what's in flight across my agents | Dashboard lists missions grouped by status, sortable |

## Scope

### MVP (v1, Cloudflare demo target)

The MVP ships one agent running one mission end-to-end with real infrastructure. Everything else is scaffolded for multi-agent, multi-mission, but only one path is hardened.

**In scope for MVP:**

- Fork of `cloudflare/agentic-inbox` as the base
- All three agents fully implemented (Mara, Otto, Iris) with real behavior, not placeholders
- Mission creation via plain-language brief
- Four-phase mission execution (understand → research → outreach → handoff) as a Cloudflare Workflow with approval gates where they're genuinely needed
- Research phase: live web research via Browser Run `/crawl` for Mara and Otto missions
- Outbound email via Email Service, signed with HMAC headers for reply routing
- Inbound email routed to the correct mission via HMAC-signed Reply-To headers
- Three approval types: silent-confirm, freeform-response, multi-choice (detailed in Approval model section)
- Confident-by-default agent behavior — agents act unless they hit a genuinely unknown situation
- Activity stream per mission, updating via WebSocket
- Agent memory view, editable
- Research log per mission, editable
- **Contacts as a first-class entity** — every person interacted with is tracked across missions; research phase checks prior history before drafting; suppress / do-not-email is honored
- **People view** — top-level UI surfacing all contacts with interaction history
- Mission dashboard with status grouping
- One real mission running end-to-end during the demo window

**Triage order if weekend time runs short.** If any of the following can't land, drop them in this order (keep the earlier items, drop later ones first):

1. Iris — monitoring behavior is the least demo-friendly and the most easily faked as UI
2. Live Browser Run research — can fall back to pre-seeded target lists
3. Memory editing — can revert to read-only; data model stays the same
4. Mara's full research capability — can restrict to one type of mission
5. People view UI — Contacts stay in the data model and influence behavior; dedicated UI can be deferred
6. Otto must ship. Without Otto, there is no demo.

Note: the Contact *entity and its behavioral integration* must ship even if the People view UI gets cut. Otto must check prior history before drafting to any target, even if the user can only see Contacts through the mission activity stream rather than a dedicated view.

**MVP deliverables:**

- Working deployed instance at `missions.polen.so` (or equivalent)
- GitHub repo, forked from agentic-inbox, open-source
- 90-second film showing mission lifecycle
- Writeup documenting architecture and reasoning
- At least one mission that actually completed a handoff to a real third-party human

### Phase 2 — product readiness

**Deferred to after Cloudflare demo:**

- Agent-proposed memory additions (agent suggests what to remember; user approves)
- User onboarding questionnaire for memory seeding
- Mission templates (common mission patterns with pre-filled briefs)
- Pause / resume / redirect / kill primitives (the "ongoing steering" layer)
- Deliverability warm-up protocols for new domains
- Basic multi-user auth beyond Cloudflare Access
- Mission archive with search

### Phase 3 — scaled product

**Deferred further:**

- Custom agents (user-created agent types)
- Team/shared missions
- Calendar integration for scheduling missions
- Integrations beyond email (LinkedIn, SMS)
- Mission marketplace (community-contributed templates)
- Billing and paid tiers

## Mission lifecycle

Every mission follows the same state machine, implemented as a Cloudflare Workflow per mission.

```
draft → understand → research → awaiting-approval → outreach → monitoring → handoff → complete
                                                        ↑           ↓
                                                        ←───────────┘
                                                        (approval loops)
```

### States

- **draft** — user is composing the brief, not yet submitted
- **understand** — agent parses brief into a structured plan. For clear briefs, it proceeds to research without asking. For genuinely ambiguous briefs, it asks one specific question.
- **research** — agent assembles target list (live via Browser Run, or from pre-seeded list as fallback)
- **awaiting-approval** — mission is paused on an approval gate. Used sparingly — see Approval model.
- **outreach** — active; agent is sending and receiving emails against the target list
- **monitoring** — active but quiet; waiting for replies, running scheduled follow-ups
- **handoff** — at least one thread has warmed to the point of human introduction; agent composes handoff email
- **complete** — completion condition met, mission archived
- **paused** — user has paused the mission; no new actions taken
- **cancelled** — user killed the mission

### Completion conditions per agent

- **Otto missions** — reach N handoffs where N is the user-specified target (e.g. "5 podcast bookings"). Can also complete early if user manually marks it complete.
- **Mara missions** — deliver the researched report; user marks it accepted.
- **Iris missions** — no natural completion. Runs until cancelled. "Complete" isn't really the right state — use "active" indefinitely.

### The approval model

The core principle: **agents act by default, escalate only when the cost of being wrong is high.** A mission is a time-saving product. If it stops every few hours to ask permission, it isn't saving time. The user should feel like they're being kept informed, not kept in charge of every keystroke.

This principle shapes where approval gates exist, what types of approvals exist, and how timeouts behave.

**Where approvals exist** (narrow list, deliberately — the goal is to stay out of Otto's way):

- **When the agent literally cannot proceed.** The agent needs information or a decision it genuinely does not have. A recipient asks about budget and the agent has no policy for this. A host asks if Tuesday 3pm works and the agent has no calendar access. These are freeform-response or multi-choice approvals. They block until answered because there's nothing the agent can sensibly do otherwise.
- **Before a handoff email is sent.** The agent posts its handoff draft as a silent-confirm with a short window (default 2 hours). If the user doesn't intervene, it sends. The user sees it land in their own inbox because they're cc'd. This is the one significant moment where the agent checks in — and even here, the default is to proceed, not to hold.
- **When the brief is genuinely unparseable.** The agent asks one specific clarifying question before starting. Not "can you confirm your brief?" but "when you say 'interesting people' — do you mean potential collaborators, investors, or peers in your space?" Clear briefs skip this entirely.

**What does not trigger approval:**

- The first outbound email. Otto drafts it, logs it to the activity stream, and sends it. If it's wrong, the user sees it in the log and can course-correct — but the user is not in the critical path.
- Subsequent outbound emails, follow-ups, or scheduled nudges. All autonomous.
- Target list assembly. The agent researches and uses the list.
- Positive replies. The agent continues the conversation toward a handoff.
- Negative replies. The agent sends a graceful close and parks the thread.
- Known-question replies. The agent answers from memory.
- Bounces, spam flags, or delivery failures. The agent logs and moves on.

The principle: **Otto should be able to run a whole mission, from brief to handoff, without the user doing anything — as long as no one asks him something he genuinely doesn't know.**

**Approval types** (three of them, each mapped to a specific situation):

- **Silent confirm.** "Sending handoff email in 2 hours. Tell me to hold if needed." Default window short (2 hours for handoffs, 6 hours for other uses), then proceeds automatically. Used for significant but not blocking moves. *Default action: proceed after timeout.*
- **Freeform response.** "They asked about budget — I don't have that information. What should I say?" User provides free text. Agent integrates and sends. *Default action: hold until user acts.* The agent cannot proceed without the information.
- **Multi-choice decision.** "They asked if Tuesday 3pm works. Which: yes / no / suggest a different time." User picks. *Default action: hold until user acts.*

Notice what's gone: the edit-then-send approval type is not part of the MVP approval model. Users can edit Otto's sent emails after the fact (by taking over a thread), but they don't gate Otto's sends.

**Timeout behavior.** Each approval type has a different default:

- Silent-confirm (handoff): 2 hours, then proceeds
- Silent-confirm (other): 6 hours, then proceeds
- Freeform response: holds indefinitely, reminder at 24 hours
- Multi-choice: holds indefinitely, reminder at 24 hours

The user can extend or shorten windows per mission or per agent.

**The understand phase is not an approval gate.** For clear briefs ("get me booked on 3 podcasts about AI creative work"), the agent starts immediately. It does not write back "Let me confirm you want me to..." The user sees the mission kick off and watches it proceed in the activity stream. If the brief is genuinely ambiguous ("find me some interesting people") the agent asks one specific question — not "can you clarify?" but a targeted question the brief requires answered to proceed.

**Inbound replies do not default to asking.** The reply classifier categorizes each reply as positive, negative, known-question, unknown-question, or ambiguous. Positive, negative, and known-question replies get handled automatically. Only unknown-question and ambiguous replies escalate. The classifier is prompted to err toward auto-handling — when in doubt, if the agent can send a reasonable neutral reply without committing the user to anything, it does so.

**What the UI signals to the user.** Approvals surface in three places:

- A global "needs you" count in the top navigation (only counts blocking approvals — freeform and multi-choice)
- A mission-level badge and summary at the top of the mission view
- An email notification to the user's real inbox — but only if a *blocking* approval has been pending more than 24 hours. Silent-confirms never trigger notifications.

Silent-confirms appear in the dashboard with a countdown but do not demand attention. If the user doesn't check, the action happens. This is correct behavior — the whole point is to avoid demanding attention for things the agent is confident about.

**The voice of approval requests.** When the agent does need something, the prompt is short and action-oriented. Not "Could you please review this draft when you have a moment?" but "Mathew asked about budget. What should I tell him?" The agent is respectful but brief. The less it performs deference, the less the user feels pestered.

**Take-over as the editing mechanism.** If the user wants to edit what Otto's doing on a specific thread, they take over the thread — one click, Otto steps out, the user is now the direct correspondent. This replaces the edit-then-send approval pattern. It's coarser (you take over the whole thread, not one draft) but it matches what users actually want: not "approve every email" but "I'll handle this one, Otto, thanks."

## Interface architecture

The product has three primary destinations in the top navigation — **Missions**, **People**, **Agents** — plus a thread drawer that opens from within mission workspaces. The inbox metaphor is used only in the thread drawer.

### Top navigation

Three tabs, always visible:

- **Missions** (default) — the dashboard of active and past missions
- **People** — the full contact list, built up by all agents across all missions
- **Agents** — Mara, Otto, Iris — click to see each agent's profile and memory

### Missions — dashboard

The home view. Lists all missions grouped by status. Shows:

- A "Needs you" section at the top (any mission with a pending blocking approval)
- An "Active" section (missions in outreach or monitoring)
- A "Completed" section (collapsed by default)
- Each mission card: name, assigned agent, phase, progress indicator, last activity

A "New mission" button, always visible.

### Missions — workspace (one per mission)

One page per mission. Three areas visible simultaneously:

**Header** — mission name, brief (editable), assigned agent, phase indicator, pause/edit/kill actions, progress toward completion.

**Activity stream** — left column, scrollable. A chronological log of everything that happened on this mission. Research notes, emails sent, replies received, approvals requested, approvals resolved. When research surfaces a known contact, the entry appears inline with their history and the agent's resulting decision ("skipping — declined in March" or "referencing previous thread in new draft"). User can annotate any entry.

**Threads** — right column, scrollable. One card per target. Each card shows: recipient name, recipient host, contact badge (New / Previously emailed / Previously booked / etc.), thread status (booked, awaiting, parked, declined, needs-you), most recent message preview, thread age. Cards sort by urgency — needs-you first, then booked, then active, then parked, then declined.

Clicking a thread card opens the thread drawer.

**Pending approvals strip** — if any blocking approvals are pending, they appear as cards pinned above the activity stream. User resolves them in place without navigating.

### Missions — thread drawer

Opens as a drawer from the right side of the mission workspace. Shows:

- The email thread (familiar email UI)
- Agent notes about this specific recipient (right-side panel)
- A "previous history" summary if this contact has been emailed before on other missions
- Actions: reply as agent, take over thread, close thread, mark as booked/declined/parked

This is the only place in the product where the interface feels inbox-like. Everything else is project management.

### People — contact list

The full list of everyone any agent has ever interacted with, for this user. Sortable by last interaction, total interactions, outcome. Filterable by outcome (positive, ghosted, declined, booked, active) and by which agent has touched them.

Each row shows: name or email, last interaction date, total interactions, last outcome, which agents/missions have touched them.

Search across name, email, and note content.

### People — contact profile

Click any contact to see their full profile:

- Basic info (name, email, role context as learned)
- Running summary (agent-maintained, user-editable)
- Full interaction timeline: every email sent, every reply received, every mission that touched them, every research note, chronologically
- Outcome history per thread
- Actions: suppress (do not email), edit notes, delete contact, export contact data

Profile updates live — when an agent adds a note or sends an email, the profile reflects it without a refresh.

### Agents — profile view

One page per agent. Shows:

- Agent identity (name, bio, voice, signature, avatar) — editable
- Agent memory (structured, editable) — About me, Policies, Topics
- Active missions assigned to this agent
- History — past missions run by this agent

## Technical considerations

### Stack

- **Hosting and runtime.** Cloudflare Workers, with deployment via `wrangler`. Fork of `cloudflare/agentic-inbox` as the base.
- **State.** Durable Objects with embedded SQLite. One Durable Object class per entity: User, Agent, Mission, Thread.
- **Workflows.** Cloudflare Workflows via the Agents SDK's `AgentWorkflow` base class. One workflow instance per active mission.
- **Email.** Cloudflare Email Service for both inbound (via Email Routing) and outbound (via Workers binding).
- **AI.** AI Gateway fronting Anthropic (Claude) for drafting, Workers AI for classification. This split is deliberate — drafting quality matters more than cost, classification is commodity.
- **Browser research.** Cloudflare Browser Run with its `/crawl` endpoint for research phase. Stagehand or Playwright for richer interactions when needed.
- **Frontend.** React 19, React Router v7, Tailwind, following the agentic-inbox conventions.
- **Auth.** Cloudflare Access in production. Skipped for local development.
- **Attachments and long artifacts.** R2.

### Data model

Designed for multi-user from day one. Every entity carries a `user_id`. Minimal auth layer sits in front (Cloudflare Access SSO).

```
User
  id, email, name, domain, created_at

Agent
  id, user_id, role (mara|otto|iris), name, bio, voice, signature, avatar_url, email_local_part

Memory (one per user+agent pair)
  id, user_id, agent_id, sections: {about, policies, topics}, updated_at

Contact
  id, user_id, email (unique per user), name (nullable), role_context (nullable),
  first_seen_at, last_interaction_at, total_interactions,
  last_outcome (null|positive|negative|ghosted|booked|active|declined),
  status (active|suppressed),
  notes (freeform, agent-maintained summary), updated_at

Contact_activity
  id, contact_id, mission_id (nullable), agent_id,
  timestamp, type (email_sent|email_received|researched|monitored|noted|outcome_set),
  summary, metadata (json)

Mission
  id, user_id, agent_id, brief, phase, completion_condition, created_at, completed_at

Research_log_entry
  id, mission_id, timestamp, type (note|web_fetch|synthesis|contact_check),
  content, source_url, related_contact_id (nullable)

Target
  id, mission_id, contact_id (created or linked during research),
  name, email, context (json),
  status (pending|contacted|replied|booked|declined|parked|human|skipped_prior_history)

Thread
  id, mission_id, target_id, contact_id, subject, last_activity,
  status (active|awaiting|human|booked|declined|parked)

Message
  id, thread_id, direction (in|out), from, to, subject, body, sent_at, message_id, in_reply_to

Approval_request
  id, mission_id, thread_id (nullable),
  type (silent_confirm|freeform|multi_choice),
  prompt, context, options (json, for multi_choice),
  proposed_action (json, for silent_confirm — what the agent will do if not interrupted),
  timeout_at, default_behavior (proceed|hold),
  status, created_at, resolved_at, resolution

Activity_event
  id, mission_id, timestamp, type, description, metadata (json)
```

### Why Durable Objects for missions

Each mission is a Durable Object instance keyed by `mission_id`. This means:

- Mission state is localized — no external database load for common operations
- The mission's workflow, state, and SQL queries happen in one place
- Missions can schedule their own follow-ups via `scheduleEvery()`
- Missions persist for weeks without server costs when idle
- At scale, millions of concurrent missions don't require any sharding decisions

The User and Agent also run as Durable Objects. The User DO coordinates across its missions. The Agent DO holds the memory, which is mutated only when missions report findings.

### HMAC reply routing

Every outbound email from an agent includes an HMAC-signed `Reply-To` header that encodes `(mission_id, thread_id, target_id)`. When a reply arrives, the email handler verifies the signature and routes the message to the correct Mission instance. This is not optional — without it, we either need an address per thread (intractable) or a guess-based routing (fragile).

The Agents SDK ships this as a first-class feature.

### Latency and performance

- Mission creation to first agent response: < 5 seconds (most of it is the first LLM call)
- Inbound email arrival to agent processing: < 30 seconds
- Approval resolution to visible state change: < 1 second (via WebSocket broadcast)
- Research phase duration: variable, up to 10 minutes for live web crawl; stretch goal, not MVP

### Scheduling

Missions schedule their own work via `this.schedule()` and `this.scheduleEvery()`:

- Follow-up emails (e.g. "if no reply in 7 days, send follow-up")
- Inactive mission checks (e.g. "every 3 days, confirm the mission isn't stuck")
- Handoff reminders (e.g. "24 hours after handoff, check that the user replied")

All of these are durable. A mission can be paused for a week mid-schedule and pick up cleanly.

### Deliverability

For MVP and demo:
- Send only to recipients who have been primed (explicitly agreed to receive agent emails)
- Use a subdomain (`missions.polen.so`) to isolate sender reputation from the user's main domain
- Include clear "this is an agent" framing in every first-touch email
- Monitor bounces and hard-stop on consecutive failures

For v2:
- Domain warm-up protocols
- Bounce rate monitoring with automatic mission pause on anomaly
- Feedback loop registration with major providers

### Observability

Use the Agents SDK v0.7 observability system — `diagnostics_channel` events published to seven named channels. Forward to Tail Workers in production. For local development, use the typed `subscribe()` helper to inspect mission execution.

Key events to track per mission:
- `mission.created`, `mission.phase_changed`, `mission.completed`, `mission.cancelled`
- `approval.requested`, `approval.resolved` (with duration)
- `email.sent`, `email.received`, `email.bounced`
- `research.note_added`, `memory.updated`
- `contact.created`, `contact.updated`, `contact.suppressed`
- `contact.prior_history_found` (when research surfaces an existing Contact — one of the most important signals for debugging misbehavior)

## Design principles

The product should feel like working with three trusted colleagues, not using an AI tool. Every design decision descends from this.

**Confident by default, escalate only when necessary.** Agents are here to save time. They act, they don't check in constantly. When they don't know something, they say so and ask one specific question. When they do know, they proceed. The user is the overseer, not the authorizer. A mission that pesters the user for approval every few hours has failed its core job.

**Clean, simple, inbox-adjacent but not inbox.** The main views are project workspaces. Email UI appears only inside thread drawers. No folder metaphors at the top level.

**The agent's voice is present in the UI.** When Mara reports research, the UI shows her handwriting (styled quotes, her name, her avatar). When Otto drafts an email, the draft carries his signature. Agents are characters, not engines.

**Transparency over hiding complexity.** The research log is visible. The memory is editable. Every approval shows the agent's reasoning. Users should always be able to ask "why did it do that?" and find the answer on screen.

**Calm defaults, urgent exceptions.** Most of the time the UI is quiet. When something genuinely blocks progress, it surfaces at the top of the dashboard and sends a notification. Otherwise, the user shouldn't feel pressured to check in. Silent-confirms accumulate in the dashboard without notifications — users glance at them when they want to, not when the app demands.

**Restraint in typography and color.** Serif for long-form agent writing (research notes, outbound drafts). Sans-serif for UI chrome. Color used functionally — amber for needs-attention, green for complete, dimmed for archived. No decorative gradients.

**Density matches trust.** A mission with many targets should not bury the user. Thread cards are compact but scan-readable in under a second each. The mission workspace accommodates 50 threads without becoming unusable.

### Specific design decisions

- **Typography.** UI uses a neutral sans-serif (Inter or the agentic-inbox default). Long-form agent writing (drafts, research notes, memory entries) uses a readable serif (Source Serif or similar). This distinction reinforces who's writing.
- **Agent accent colors.** Each agent has one accent color used sparingly. Mara: slate blue. Otto: warm amber. Iris: sage green. These appear as avatar backgrounds, subtle left-border accents on their content, and nowhere else.
- **Status language.** Avoid SaaS-speak. "Awaiting reply" not "In progress." "Warm" not "Qualified." "Parked" not "Deferred." The vocabulary should feel like how a person would describe the state, not how a CRM would.
- **Dashboard density.** Mission cards show no more than four lines of content each. Scannable. No dense stats.
- **Mobile.** Ship mobile-responsive, not mobile-first. Core user is on desktop during focused work sessions, on mobile for checking notifications and resolving approvals.

## Risks and edge cases

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent writes a bad email that harms a real relationship | Medium | High | Every sent email appears immediately in the activity stream; user can take over a thread at any time to course-correct; agent signs every first-touch email as an agent (transparency lowers the cost of errors); memory captures policies and preferences over time so early mistakes don't repeat |
| Agent emails someone we previously contacted as if we'd never spoken | Medium | High | Contacts are checked at research phase before target list is finalized; prior outreach surfaces in draft prompt; declined/ghosted contacts trigger skip or ask behaviors |
| Agent emails someone after they've asked us to stop | Low | Critical | Suppressed contacts are filtered out of every target list globally; suppression is a hard exclusion, not a soft preference |
| Two missions target the same person concurrently | Medium | Medium | Before creating a new Thread, system checks if an active Thread already exists for that Contact; active Threads block duplicate outreach; user is notified |
| Deliverability fails, emails land in spam | High | Medium | Subdomain isolation, primed recipients in demo, clear "this is an agent" framing reduces spam classification |
| Approval timeouts strand a mission indefinitely | Low | Medium | Silent-confirm approvals auto-proceed after timeout; only freeform-response and multi-choice hold indefinitely, and both get 24-hour reminders |
| Agent asks for approval too often and fails its time-saving promise | Medium | High | Approval gates are deliberately narrow; reply classifier errs on the side of acting; silent-confirm is default for low-stakes moves |
| Contact data accumulates without oversight and becomes a privacy problem | Low | High | Contacts store only what's functionally necessary; no third-party enrichment; user-owned and fully deletable; export available as JSON; recipient suppression is honored immediately |
| User edits memory in a way that breaks the agent's behavior | Low | Medium | Memory changes don't propagate to active workflows until the agent's next step; validation on entries |
| Inbound email can't be routed to the correct mission | Low | High | HMAC-signed headers guarantee routing; fallback inbox for unroutable messages; fallback creates a Contact even for unrouted messages so history is preserved |
| Mission workflow gets stuck in a loop | Medium | Medium | Loop detection: if no state change in 48 hours, flag for user review |
| Agent hallucinates facts about the user in an email | Medium | High | Drafts are constrained to memory and research log content; agent instructed never to invent biographical facts; user can click any claim in a sent email to see its source |
| Browser Run fails during research phase | Medium | Low | Graceful fallback to user-supplied target list; research phase is skippable |
| Workers rate limits hit during heavy mission activity | Low | Medium | Queue outbound sends; monitor Email Service daily quota; respect 1000/day beta limit |
| User creates a mission that's impossible (agent can't complete it) | High | Low | Agent reports difficulty in understand phase and asks user to refine; no silent failures |
| Recipient marks agent emails as spam | Medium | Medium | Contact suppression populated automatically; agent stops writing to any address that marks a message as spam |
| User's real inbox gets flooded with approval notifications | Medium | Low | Notification digest (one email per 24 hours summarizing all pending approvals) instead of per-approval alerts |

## Rollout plan

### MVP launch (Cloudflare demo window)

Target: Cloudflare Agent Day or equivalent showcase moment.

**Pre-launch (weekend build):**
- Fork and scaffold the repo
- Implement Otto end-to-end
- Run one real mission with a primed recipient
- Record the film
- Write the blog post

**Launch:**
- Ship the demo at Cloudflare event or via social post
- Release the repo publicly
- Submit to Cloudflare's showcase channel

**Post-launch week 1:**
- Monitor forks, issues, community feedback
- Fix critical bugs
- Publish one follow-up post addressing common questions

### Phase 2 rollout (private beta)

Target: 10-20 users, mostly people Luke knows personally.

**Criteria to enter Phase 2:**
- Otto has run at least 10 missions end-to-end without intervention
- Deliverability rate above 90% to Gmail, 85% to outlook.com
- Median time from mission creation to first outbound email under 5 minutes
- Memory view is stable and editable

**Beta duration:** 30 days, invite-only. Focus on retention and mission completion rate.

### Phase 3 rollout (public availability)

Gated on beta metrics. If 50% of beta users complete at least one mission and 40% return within 14 days, proceed. Otherwise iterate.

## Implementation notes for the building agent

This section is for the coding agent (Claude Code or equivalent) that will implement this PRD. It is not user-facing.

### Order of operations

1. Fork `cloudflare/agentic-inbox` and get the base running locally.
2. Add the data model: create `MissionDO`, `AgentDO`, `ContactDO` (or Contact as rows in the User DO's SQLite — see note below), extend `UserDO` as needed.
3. Build the Contact ingestion layer early — before any email sending. Every outbound email, every inbound reply, every research note about a person must write to Contact and Contact_activity. This is cross-cutting and easier to add up front than to retrofit.
4. Implement the `MissionWorkflow` extending `AgentWorkflow`. Start with Otto's outreach flow — the default path runs end to end without user input. Only three things can pause it: handoff silent-confirm, unknown reply, ambiguous brief. Mara and Iris flows follow.
5. Build Otto end-to-end — his prompts, his research via Browser Run `/crawl`, his drafting, his reply classification. Get one real email exchange working before moving on. **Otto sends his own emails without pre-approval.** Every sent email appears in the activity stream with full content.
6. Integrate Contacts into Otto's research phase. Before finalizing a target list, cross-reference each candidate against the Contact table. Inject prior history into the drafting prompt. Apply the five contact-behavior rules (positive / decline / ghost / active / research-only).
7. Wire up inbound email to route to the correct Mission via HMAC-signed Reply-To headers. This is load-bearing. Test thoroughly. Inbound messages also create/update Contacts.
8. Build the frontend top-nav: Missions, People, Agents. Use the agentic-inbox component conventions.
9. Build the Mission workspace: header, activity stream, threads column, pending approvals strip.
10. Build the Thread drawer with the "previous history" summary for known contacts.
11. Implement the three approval types: silent-confirm (with countdown + auto-proceed), freeform-response, multi-choice. Also implement the take-over action on threads — not an approval, but the mechanism by which users interrupt Otto's work on a specific thread.
12. Add the activity stream with WebSocket-driven updates. Every agent action — researched, drafted, sent, received, classified, replied, contact-checked — streams in real time.
13. Build the People view: contact list, filters, sort, search. Then the contact profile: summary, timeline, actions (suppress, edit notes, delete).
14. Build Mara's research-only flow (no outreach, ends with delivered brief). Mara also reads and writes Contacts during research.
15. Build Iris's monitoring flow (polling, triggers, short update emails to the user). Iris also reads and writes Contacts when monitoring mentions of specific people.
16. Memory view — read and edit. Simple form per section (About me, Policies, Topics).
17. One real end-to-end Otto mission test with a primed recipient. Repeat for Mara if time allows.

**Note on Contact storage.** Contacts are user-scoped, not mission-scoped, and shared across all three agents. Two storage options:

- Store Contacts as SQL rows inside the `UserDO` — simpler, all Contact queries happen in one place, works for single-user MVP
- Separate `ContactDO` per Contact — matches the Durable Object pattern more closely, scales better if contacts get rich behavior later

Recommend option 1 for MVP: rows in the User DO's SQLite, indexed on `email`. Simpler, faster to build, and the migration path to option 2 is straightforward if scale demands it.

### Confident-by-default behavior — implementation specifics

This is the core behavioral principle and the coding agent should internalize it:

**Otto runs missions autonomously.** The default path from mission creation to handoff does not require any user approval. Otto reads the brief, researches, drafts, sends, handles replies, and proposes a handoff. The user is never in the critical path. They can watch the activity stream in real time, but they don't need to be watching for Otto to make progress.

**There are exactly three things that pause Otto:**

1. An inbound reply the classifier cannot handle from memory — a freeform-response approval. Otto cannot answer because he doesn't know the answer. The user must respond for the thread to continue.
2. A multi-choice decision Otto cannot make on his own — scheduling, specific offers, etc. The user picks. The thread continues.
3. A handoff ready to send — a silent-confirm approval with a 2-hour default window. Otto will send unless the user intervenes.

**Nothing else pauses Otto.** If the coding agent finds itself adding a `waitForApproval()` call anywhere else, it should stop and reconsider. The bias is toward removing approval gates, not adding them. The one exception is the rare ambiguous brief at mission start, which uses a freeform-response to get the minimum information needed to proceed.

**Specifics for implementation:**

- The understand phase does not ask "did I understand you right?" for clear briefs. It writes a single-sentence interpretation to the activity stream and starts work. The classifier for "is this brief clear enough to start?" should err toward clear — most briefs are clearer than the agent thinks.
- Otto sends his own first email. No pre-send approval. The sent email appears immediately in the activity stream with full content, so the user can see what went out, but sending is not gated on user review.
- The reply classifier biases toward auto-handling. Five categories (positive, negative, known-question, unknown-question, ambiguous), three get handled automatically (the first three). When in doubt between known-question and unknown-question, the classifier should prefer known-question — a generic neutral reply is almost always better than a user-blocking escalation.
- Silent-confirm approvals use the Agents SDK's `schedule()` method on the mission's Durable Object. The workflow creates an approval record with `timeout_at` and `default_behavior: proceed`, schedules the mission to resume at `timeout_at`, and waits. If the user intervenes first, the scheduled resume is cancelled and the user's action takes effect. If not, the scheduled resume fires and the proposed action executes.
- Take-over is not an approval type, it's a thread-level action. When the user takes over a thread, Otto stops all activity on that thread. The user is now the correspondent. Otto logs this to the activity stream and excludes the thread from his future sends and classifications. The thread's status becomes `human`.

### What to build, what to fake

**Build real:**
- Email sending and receiving, with real messages in real inboxes
- Durable Object state and workflow execution for all three agents
- HMAC-signed Reply-To routing
- Three approval types (silent-confirm, freeform-response, multi-choice) plus take-over as a thread-level action
- The four-phase lifecycle
- Live web research via Browser Run `/crawl` (with pre-seeded fallback if the crawl returns too little)
- Activity stream showing every agent action including full text of sent emails
- Memory view, editable
- **Contacts — data model, ingestion, research-phase integration, People view UI.** Every email sent or received creates or updates a Contact. Research phase cross-references Contacts before finalizing target list. Suppressed contacts are globally excluded.
- Take-over action on threads (user takes over a specific thread from the agent)
- At least one Otto mission running end-to-end with a real third party

**Acceptable to fake in MVP:**
- Multi-user: hard-code one user; data model supports many, but onboarding flow is out of scope
- Mission archive UI beyond basic status grouping
- Agent-proposed memory additions (user edits memory manually in MVP)
- Agent-proposed promotion of research notes into Contact summaries (user edits manually)

**Do not fake:**
- The handoff email. When it happens, it has to really happen, land in a real person's inbox, and actually hand the relationship over.
- The agent's voice in drafts. If Otto's drafts sound like ChatGPT, the product fails its core pitch.
- Confident-by-default behavior. A product that asks approvals for everything has failed even if every other feature works.
- Contact cross-referencing. If Otto emails someone twice without acknowledging the first thread, the product's core promise is broken. The Contact check is not optional.

**If weekend time runs short, cut in this order:**

1. Iris — her flow is self-contained and the least demo-critical
2. People view UI — the Contact data model and cross-referencing must ship; the dedicated UI can be deferred (users see Contact history through research log entries instead)
3. Live Browser Run research — fall back to pre-seeded target lists
4. Memory editing — revert to read-only
5. Full Mara research — restrict to one type of report

**Never cut:** Otto's autonomous send-without-approval behavior; the three approval types + take-over; the activity stream; real email sending and receiving; the Contact data model and research-phase cross-referencing (even if the UI for Contacts doesn't ship, the behavior must).

### Prompt craft is the product

The five prompts that matter most:

- **Understand prompt.** Takes a brief, produces a structured plan. If the brief is clear, outputs a plan and a one-line interpretation to write to the activity stream. If genuinely ambiguous, outputs a single specific clarifying question.
- **Target enrichment prompt (research phase).** Takes a candidate target and their Contact history (if any). Produces a ranked recommendation: proceed with fresh outreach, reference prior thread, skip (declined), ask user (ghosted), or hold (active thread exists). This is where contact awareness becomes behavior.
- **Outreach draft prompt (Otto).** Takes a mission, a target, user context (from memory), mission research log, and Contact history if any. Produces an email draft in Otto's voice. Must always include "I'm [name]'s agent" framing in first-touch emails. If there's prior history, reference it naturally rather than writing as if fresh.
- **Reply classifier prompt (Otto).** Takes an inbound message and the thread context. Produces a classification (positive / negative / known-question / unknown-question / ambiguous) and an action recommendation (auto-reply / ask-user-freeform / ask-user-multi-choice / close-thread). Bias toward auto-reply.
- **Research synthesis prompt (Mara).** Takes raw crawled content. Produces a structured brief with inline source citations.

Spend real time on these. They determine whether the product works. The technical infrastructure is important but solved; the prompts are where the bet is.

### Testing

- Unit tests for workflow state transitions
- Unit tests for the contact-behavior rules (given a prior outcome, does the agent make the right decision?)
- Integration test: full mission lifecycle in local dev with mocked email
- Integration test: second mission targeting a contact from a first mission — verify the agent behaves correctly (references, skips, or asks based on prior outcome)
- End-to-end manual test: one real Otto mission, primed recipient, real Gmail
- End-to-end manual test: create a second mission that overlaps with the first, verify no accidental re-outreach
- Smoke test for each approval type: render the UI, resolve, see correct workflow resumption

### Commit discipline

Follow the agentic-inbox repo conventions. Small commits. Descriptive messages. Don't mix refactors with new features.

---

## Glossary

- **Mission** — a user-defined goal assigned to an agent, with a clear completion condition.
- **Agent** — one of the three roles (Mara, Otto, Iris) that can run missions. Not the same as a Cloudflare Agents SDK `Agent` class, which refers to the Durable Object.
- **Mara / Otto / Iris** — the three agent roles: researcher (Mara), correspondent (Otto), watcher (Iris).
- **Thread** — an email conversation between the agent and one target, scoped to a mission.
- **Target** — a specific person or entity the agent is trying to reach or research within a mission. Always linked to a Contact.
- **Contact** — a real person the user's agents have interacted with. User-scoped and shared across all agents and missions. Persists across missions and across time.
- **Contact_activity** — the timestamped log of every interaction a Contact has had with any agent, across all missions.
- **Suppressed contact** — a Contact marked "do not email." Excluded from every future mission's target list, globally, regardless of the brief.
- **Memory** — the long-lived, cross-mission, agent-scoped context (facts and preferences about the user).
- **Research log** — the short-lived, mission-scoped notes an agent generates during a mission.
- **Approval** — a pause in mission execution where the agent asks the user for a decision. Three types: silent-confirm, freeform-response, multi-choice.
- **Silent-confirm** — an approval type that auto-proceeds after a timeout if the user doesn't intervene. Default action is proceed.
- **Freeform-response** — an approval type where the user provides free text the agent integrates into its reply. Holds indefinitely.
- **Multi-choice** — an approval type where the user picks from a set of options. Holds indefinitely.
- **Take-over** — a thread-level action where the user takes over a specific thread from the agent. Not an approval; it's the mechanism for user intervention on a single conversation.
- **Handoff** — the moment where the agent introduces the user into a warm thread and steps back. The agent's final action on that thread.
- **Completion** — the mission reaching its defined end state (delivered report, target bookings hit, or user-marked done).
- **Confident-by-default** — the product's core behavioral principle: agents act without asking unless they hit a situation they genuinely cannot handle.
