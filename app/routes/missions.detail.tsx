// Mission workspace — editable brief + stats header, email timeline as the
// main column, activity sidebar as the narrow "what has the agent learnt"
// rail. Polls every 3s for live updates.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router";
import { useMemo, useState } from "react";
import { MissionsNav } from "~/components/MissionsNav";
import {
	missionsApi,
	type Approval,
	type ActivityEvent,
	type Message,
	type TimelineMessage,
} from "~/services/missions-api";
import { labelForEvent, phaseLabel } from "~/lib/activity-labels";

export default function MissionDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
	const [expandedMessageId, setExpandedMessageId] = useState<string | null>(
		null,
	);
	const [editingBrief, setEditingBrief] = useState(false);
	const [briefDraft, setBriefDraft] = useState("");

	const missionQ = useQuery({
		queryKey: ["mission", id],
		queryFn: () => missionsApi.getMission(id!),
		enabled: !!id,
		refetchInterval: 3000,
	});
	const activityQ = useQuery({
		queryKey: ["activity", id],
		queryFn: () => missionsApi.getActivity(id!),
		enabled: !!id,
		refetchInterval: 3000,
	});
	const messagesQ = useQuery({
		queryKey: ["messages", id],
		queryFn: () => missionsApi.getMissionMessages(id!),
		enabled: !!id,
		refetchInterval: 3000,
	});

	const cancel = useMutation({
		mutationFn: () => missionsApi.cancelMission(id!),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", id] }),
	});

	const remove = useMutation({
		mutationFn: () => missionsApi.deleteMission(id!),
		onSuccess: () => {
			dropStoredMissionId(id!);
			navigate("/");
		},
	});

	const saveBrief = useMutation({
		mutationFn: (brief: string) => missionsApi.updateMissionBrief(id!, brief),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["mission", id] });
			qc.invalidateQueries({ queryKey: ["activity", id] });
			setEditingBrief(false);
		},
	});

	if (!id || missionQ.isLoading) {
		return (
			<div className="min-h-screen bg-kumo-recessed">
				<MissionsNav />
				<main className="mx-auto max-w-6xl px-6 py-8 text-kumo-muted">
					Loading mission…
				</main>
			</div>
		);
	}
	if (!missionQ.data) {
		return (
			<div className="min-h-screen bg-kumo-recessed">
				<MissionsNav />
				<main className="mx-auto max-w-6xl px-6 py-8">
					<p className="text-kumo-muted">Mission not found.</p>
					<Link to="/" className="mt-4 inline-block text-amber-600">
						← Back to missions
					</Link>
				</main>
			</div>
		);
	}

	const { mission, threads, pending_approvals } = missionQ.data;
	const events = activityQ.data?.events ?? [];
	const messages = messagesQ.data?.messages ?? [];
	const agentRole = mission.agent_id.split(":")[1] ?? "otto";

	const emailsSent = messages.filter((m) => m.direction === "out").length;
	const repliesReceived = messages.filter((m) => m.direction === "in").length;
	const latestInbound = messages
		.filter((m) => m.direction === "in")
		.reduce<TimelineMessage | null>(
			(acc, m) => (!acc || m.sent_at > acc.sent_at ? m : acc),
			null,
		);
	const answered = !!mission.answer_summary;
	const phasePillLabel = answered ? "Answered" : phaseLabel(mission.phase);

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-6xl px-6 py-6">
				{answered && (
					<AnswerCard
						summary={mission.answer_summary!}
						fromLabel={
							latestInbound?.target_name ||
							latestInbound?.from_addr ||
							null
						}
						answeredAt={mission.answered_at}
					/>
				)}
				<header className="mb-4 flex items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 text-xs mb-2">
							<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
								{agentRole}
							</span>
							<span
								className={`rounded-full px-2 py-0.5 ${
									answered
										? "bg-emerald-100 text-emerald-700"
										: "border border-kumo-subtle text-kumo-muted"
								}`}
							>
								{phasePillLabel}
							</span>
						</div>
						{editingBrief ? (
							<div className="space-y-2">
								<textarea
									value={briefDraft}
									onChange={(e) => setBriefDraft(e.target.value)}
									rows={3}
									autoFocus
									className="w-full rounded-md border border-kumo-subtle bg-kumo-base px-3 py-2 font-serif text-lg text-kumo-default leading-snug focus:border-amber-400 focus:outline-none"
								/>
								<div className="flex items-center gap-2">
									<button
										onClick={() => saveBrief.mutate(briefDraft)}
										disabled={
											!briefDraft.trim() ||
											briefDraft.trim() === mission.brief ||
											saveBrief.isPending
										}
										className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
									>
										Save
									</button>
									<button
										onClick={() => setEditingBrief(false)}
										className="rounded-md border border-kumo-subtle px-3 py-1.5 text-xs text-kumo-muted hover:text-kumo-strong"
									>
										Cancel
									</button>
								</div>
							</div>
						) : (
							<div className="group flex items-start gap-2">
								<p className="font-serif text-lg text-kumo-default leading-snug flex-1">
									{mission.brief}
								</p>
								<button
									onClick={() => {
										setBriefDraft(mission.brief);
										setEditingBrief(true);
									}}
									className="mt-1 shrink-0 text-xs text-kumo-muted opacity-0 hover:text-amber-600 group-hover:opacity-100 transition-opacity"
									aria-label="Edit mission"
								>
									Edit
								</button>
							</div>
						)}
						<div className="mt-2 flex items-center gap-3 text-xs text-kumo-muted">
							<span>{emailsSent} sent</span>
							<span>·</span>
							<span>{repliesReceived} repl{repliesReceived === 1 ? "y" : "ies"}</span>
							<span>·</span>
							<span>{threads.length} thread{threads.length === 1 ? "" : "s"}</span>
							<span>·</span>
							<span>started {formatRelative(mission.created_at)}</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{mission.phase !== "complete" && mission.phase !== "cancelled" && (
							<button
								onClick={() => cancel.mutate()}
								className="rounded-md border border-kumo-subtle px-3 py-1.5 text-xs text-kumo-muted hover:text-kumo-strong"
							>
								Cancel mission
							</button>
						)}
						<button
							onClick={() => {
								if (
									confirm(
										"Delete this mission permanently? Threads and activity will be removed.",
									)
								) {
									remove.mutate();
								}
							}}
							className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
						>
							Delete
						</button>
						<button
							onClick={() => navigate("/")}
							className="text-xs text-kumo-muted hover:text-kumo-default"
						>
							Close
						</button>
					</div>
				</header>

				{pending_approvals.length > 0 && (
					<PendingApprovalsStrip
						approvals={pending_approvals}
						missionId={id}
					/>
				)}

				<div className="grid grid-cols-12 gap-6 mt-4">
					<section className="col-span-12 md:col-span-8">
						<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
							Emails
						</h3>
						<EmailTimeline
							messages={messages}
							expandedId={expandedMessageId}
							onToggle={(msgId) =>
								setExpandedMessageId(expandedMessageId === msgId ? null : msgId)
							}
							onOpenThread={setSelectedThreadId}
						/>
					</section>
					<section className="col-span-12 md:col-span-4">
						<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
							Activity
						</h3>
						<ActivitySidebar events={events} />
					</section>
				</div>
			</main>
			{selectedThreadId && (
				<ThreadDrawer
					missionId={id}
					threadId={selectedThreadId}
					onClose={() => setSelectedThreadId(null)}
				/>
			)}
		</div>
	);
}

function dropStoredMissionId(id: string) {
	if (typeof window === "undefined") return;
	try {
		const key = "missions.ids";
		const ids: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
		localStorage.setItem(key, JSON.stringify(ids.filter((x) => x !== id)));
	} catch {
		// no-op
	}
}

// ── Answer headline ─────────────────────────────────────────────────

function AnswerCard({
	summary,
	fromLabel,
	answeredAt,
}: {
	summary: string;
	fromLabel: string | null;
	answeredAt: string | null;
}) {
	return (
		<div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
			<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
				<span aria-hidden>●</span>
				<span>Answered</span>
			</div>
			<p className="mt-1 font-serif text-xl text-emerald-950 leading-snug">
				{summary}
			</p>
			{(fromLabel || answeredAt) && (
				<p className="mt-2 text-xs text-emerald-800/80">
					{fromLabel ? `— from ${fromLabel}` : ""}
					{fromLabel && answeredAt ? " · " : ""}
					{answeredAt ? formatRelative(answeredAt) : ""}
				</p>
			)}
		</div>
	);
}

// ── Pending approvals ───────────────────────────────────────────────

function PendingApprovalsStrip({
	approvals,
	missionId,
}: {
	approvals: Approval[];
	missionId: string;
}) {
	return (
		<div className="space-y-2">
			{approvals.map((a) => (
				<ApprovalCard key={a.id} approval={a} missionId={missionId} />
			))}
		</div>
	);
}

function ApprovalCard({
	approval,
	missionId,
}: {
	approval: Approval;
	missionId: string;
}) {
	const qc = useQueryClient();
	const [text, setText] = useState("");
	const resolve = useMutation({
		mutationFn: (resolution: unknown) =>
			missionsApi.resolveApproval(missionId, approval.id, resolution),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", missionId] }),
	});

	return (
		<div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
			<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
				{approval.type.replace("_", " ")} · needs you
			</div>
			<p className="mb-3 text-sm text-kumo-default">{approval.prompt}</p>

			{approval.type === "freeform" && (
				<div className="space-y-2">
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="Your answer"
						rows={3}
						className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
					/>
					<button
						disabled={!text.trim() || resolve.isPending}
						onClick={() => resolve.mutate({ text })}
						className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
					>
						Send answer
					</button>
				</div>
			)}

			{approval.type === "multi_choice" && approval.options && (
				<div className="flex flex-wrap gap-2">
					{(
						JSON.parse(approval.options) as Array<{
							id: string;
							label: string;
						}>
					).map((opt) => (
						<button
							key={opt.id}
							onClick={() => resolve.mutate({ option_id: opt.id })}
							disabled={resolve.isPending}
							className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-kumo-strong hover:bg-amber-100"
						>
							{opt.label}
						</button>
					))}
				</div>
			)}

			{approval.type === "silent_confirm" && (
				<div className="space-y-2">
					{approval.proposed_action && (
						<pre className="rounded bg-white/70 p-3 text-xs text-kumo-default font-serif whitespace-pre-wrap">
							{JSON.parse(approval.proposed_action).body ?? "(no body)"}
						</pre>
					)}
					<div className="flex items-center gap-2">
						<button
							onClick={() => resolve.mutate({ decision: "send_now" })}
							className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
						>
							Send now
						</button>
						<button
							onClick={() => resolve.mutate({ decision: "cancel" })}
							className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-kumo-strong hover:bg-amber-100"
						>
							Hold
						</button>
						{approval.timeout_at && (
							<span className="text-xs text-kumo-muted">
								Auto-sends at {new Date(approval.timeout_at).toLocaleString()}
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ── Email timeline (main column) ─────────────────────────────────────

function EmailTimeline({
	messages,
	expandedId,
	onToggle,
	onOpenThread,
}: {
	messages: TimelineMessage[];
	expandedId: string | null;
	onToggle: (id: string) => void;
	onOpenThread: (threadId: string) => void;
}) {
	if (messages.length === 0) {
		return (
			<div className="rounded-lg border border-kumo-subtle bg-kumo-base p-8 text-center text-sm text-kumo-muted">
				No emails yet. The agent is still researching.
			</div>
		);
	}

	// Group consecutive messages sharing a thread so the reader sees the
	// conversation flow. Sort newest first at the group level.
	const groups = useMemo(() => groupByThread(messages), [messages]);

	return (
		<ul className="space-y-3">
			{groups.map((group) => (
				<li
					key={group.thread_id}
					className="overflow-hidden rounded-lg border border-kumo-subtle bg-kumo-base"
				>
					<div className="flex items-center justify-between border-b border-kumo-subtle bg-kumo-recessed/50 px-4 py-2">
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium text-kumo-strong">
								{group.subject ?? "(no subject)"}
							</div>
							<div className="text-xs text-kumo-muted">
								{group.target_name ?? group.target_email ?? "(target)"} ·{" "}
								{group.messages.length} message
								{group.messages.length === 1 ? "" : "s"} · {group.status}
							</div>
						</div>
						<button
							onClick={() => onOpenThread(group.thread_id)}
							className="shrink-0 text-xs text-amber-600 hover:text-amber-700"
						>
							Open thread →
						</button>
					</div>
					<ul className="divide-y divide-kumo-subtle">
						{group.messages.map((m) => (
							<EmailRow
								key={m.id}
								message={m}
								expanded={expandedId === m.id}
								onToggle={() => onToggle(m.id)}
							/>
						))}
					</ul>
				</li>
			))}
		</ul>
	);
}

interface ThreadGroup {
	thread_id: string;
	subject: string | null;
	status: string;
	target_email: string | null;
	target_name: string | null;
	messages: TimelineMessage[];
	last_at: string;
}

function groupByThread(messages: TimelineMessage[]): ThreadGroup[] {
	const byId = new Map<string, ThreadGroup>();
	for (const m of messages) {
		const existing = byId.get(m.thread_id);
		if (existing) {
			existing.messages.push(m);
			if (m.sent_at > existing.last_at) existing.last_at = m.sent_at;
		} else {
			byId.set(m.thread_id, {
				thread_id: m.thread_id,
				subject: m.thread_subject,
				status: m.thread_status,
				target_email: m.target_email,
				target_name: m.target_name,
				messages: [m],
				last_at: m.sent_at,
			});
		}
	}
	return Array.from(byId.values()).sort((a, b) =>
		b.last_at.localeCompare(a.last_at),
	);
}

function EmailRow({
	message,
	expanded,
	onToggle,
}: {
	message: TimelineMessage;
	expanded: boolean;
	onToggle: () => void;
}) {
	const out = message.direction === "out";
	return (
		<li>
			<button
				onClick={onToggle}
				className="w-full px-4 py-3 text-left hover:bg-kumo-recessed/40"
			>
				<div className="flex items-start gap-3">
					<span
						className={`mt-0.5 shrink-0 text-xs font-mono ${
							out ? "text-amber-600" : "text-emerald-600"
						}`}
						aria-hidden
					>
						{out ? "→" : "←"}
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline justify-between gap-2">
							<span className="truncate text-sm text-kumo-default">
								{out ? `To ${message.to_addr}` : `From ${message.from_addr}`}
							</span>
							<span className="shrink-0 text-xs text-kumo-muted">
								{new Date(message.sent_at).toLocaleString()}
							</span>
						</div>
						{!expanded && (
							<p className="mt-0.5 truncate text-xs text-kumo-muted">
								{firstLine(message.body)}
							</p>
						)}
					</div>
				</div>
				{expanded && (
					<pre className="mt-3 whitespace-pre-wrap font-serif text-sm text-kumo-default">
						{message.body}
					</pre>
				)}
			</button>
		</li>
	);
}

function firstLine(body: string): string {
	const trimmed = body.trim();
	const newline = trimmed.indexOf("\n");
	return newline === -1 ? trimmed : trimmed.slice(0, newline);
}

// ── Activity sidebar ─────────────────────────────────────────────────

function ActivitySidebar({ events }: { events: ActivityEvent[] }) {
	if (events.length === 0) {
		return (
			<div className="rounded-lg border border-kumo-subtle bg-kumo-base p-5 text-center text-sm text-kumo-muted">
				Waiting for the agent…
			</div>
		);
	}
	return (
		<ol className="relative space-y-3">
			{events.map((e) => (
				<ActivityItem key={e.id} event={e} />
			))}
		</ol>
	);
}

function ActivityItem({ event }: { event: ActivityEvent }) {
	const { title, kind, detail } = labelForEvent(event);
	const dotColor =
		kind === "email"
			? "bg-amber-500"
			: kind === "approval"
				? "bg-red-500"
				: kind === "milestone"
					? "bg-emerald-500"
					: "bg-kumo-subtle";
	return (
		<li className="flex gap-3 text-sm">
			<span
				className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`}
				aria-hidden
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<span className="truncate font-medium text-kumo-default">
						{title}
					</span>
					<span className="shrink-0 text-xs text-kumo-inactive">
						{new Date(event.timestamp).toLocaleTimeString([], {
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				</div>
				<p className="text-xs text-kumo-muted leading-snug">
					{detail ?? event.description}
				</p>
			</div>
		</li>
	);
}

function formatRelative(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const min = Math.floor(diff / 60000);
	if (min < 1) return "just now";
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const d = Math.floor(hr / 24);
	return `${d}d ago`;
}

// ── Thread drawer (compose / take-over) ──────────────────────────────

function ThreadDrawer({
	missionId,
	threadId,
	onClose,
}: {
	missionId: string;
	threadId: string;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["thread", missionId, threadId],
		queryFn: () => missionsApi.getThread(missionId, threadId),
		refetchInterval: 4000,
	});
	const takeOver = useMutation({
		mutationFn: () => missionsApi.takeOver(missionId, threadId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["thread", missionId, threadId] });
			qc.invalidateQueries({ queryKey: ["mission", missionId] });
		},
	});

	return (
		<div
			className="fixed inset-y-0 right-0 z-30 w-full max-w-xl bg-kumo-base shadow-xl border-l border-kumo-subtle flex flex-col"
			role="dialog"
		>
			<div className="flex items-center justify-between border-b border-kumo-subtle px-4 py-3">
				<div className="font-medium text-kumo-strong truncate">
					{data?.thread.subject ?? "Thread"}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => takeOver.mutate()}
						disabled={
							!data?.thread || data.thread.status === "human" || takeOver.isPending
						}
						className="rounded-md border border-kumo-subtle px-2 py-1 text-xs text-kumo-muted hover:text-kumo-strong disabled:opacity-50"
					>
						{data?.thread.status === "human" ? "Taken over" : "Take over"}
					</button>
					<button onClick={onClose} className="text-kumo-muted hover:text-kumo-strong">
						✕
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
				{isLoading ? (
					<div className="text-kumo-muted">Loading thread…</div>
				) : (
					(data?.messages ?? []).map((m: Message) => (
						<MessageBubble key={m.id} message={m} />
					))
				)}
			</div>
		</div>
	);
}

function MessageBubble({ message }: { message: Message }) {
	const out = message.direction === "out";
	return (
		<div
			className={`rounded-lg border p-3 ${
				out ? "border-amber-200 bg-amber-50" : "border-kumo-subtle bg-kumo-recessed"
			}`}
		>
			<div className="flex items-center justify-between text-xs text-kumo-muted">
				<span>
					{out ? "→ " : "← "}
					{out ? message.to_addr : message.from_addr}
				</span>
				<span>{new Date(message.sent_at).toLocaleString()}</span>
			</div>
			{message.subject && (
				<div className="mt-1 text-sm font-medium text-kumo-strong">
					{message.subject}
				</div>
			)}
			<pre className="mt-1 whitespace-pre-wrap font-serif text-sm text-kumo-default">
				{message.body}
			</pre>
		</div>
	);
}
