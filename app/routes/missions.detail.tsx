// Mission workspace — header, activity stream (left), threads column (right),
// pending approvals strip above the activity stream. Polls every 3s for live
// updates. (WebSocket upgrade deferred; see PRD § observability.)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router";
import { useState } from "react";
import { MissionsNav } from "~/components/MissionsNav";
import {
	missionsApi,
	type Approval,
	type Thread,
	type ActivityEvent,
	type Message,
} from "~/services/missions-api";

export default function MissionDetail() {
	const { id } = useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

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

	const cancel = useMutation({
		mutationFn: () => missionsApi.cancelMission(id!),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", id] }),
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
	const agentRole = mission.agent_id.split(":")[1] ?? "otto";

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-6xl px-6 py-6">
				<header className="mb-4 flex items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 text-xs mb-1">
							<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
								{agentRole}
							</span>
							<span className="text-kumo-muted">{mission.phase}</span>
						</div>
						<p className="font-serif text-lg text-kumo-default leading-snug">
							{mission.brief}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={() => cancel.mutate()}
							className="rounded-md border border-kumo-subtle px-3 py-1.5 text-xs text-kumo-muted hover:text-kumo-strong"
						>
							Cancel mission
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

				<div className="grid grid-cols-12 gap-4 mt-4">
					<section className="col-span-12 md:col-span-7">
						<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
							Activity
						</h3>
						<ActivityList events={events} />
					</section>
					<section className="col-span-12 md:col-span-5">
						<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
							Threads
						</h3>
						<ThreadsList
							threads={threads}
							onOpen={setSelectedThreadId}
							selectedId={selectedThreadId}
						/>
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

// ── Activity list ───────────────────────────────────────────────────

function ActivityList({ events }: { events: ActivityEvent[] }) {
	if (events.length === 0) {
		return (
			<div className="rounded-lg border border-kumo-subtle bg-kumo-base p-6 text-center text-sm text-kumo-muted">
				Waiting for Otto…
			</div>
		);
	}
	return (
		<ul className="space-y-2">
			{events.map((e) => (
				<li
					key={e.id}
					className="rounded-md border border-kumo-subtle bg-kumo-base px-3 py-2 text-sm"
				>
					<div className="flex items-center justify-between text-xs text-kumo-muted">
						<span>{e.type}</span>
						<span>{new Date(e.timestamp).toLocaleTimeString()}</span>
					</div>
					<div className="mt-1 text-kumo-default">{e.description}</div>
				</li>
			))}
		</ul>
	);
}

// ── Threads list ────────────────────────────────────────────────────

function ThreadsList({
	threads,
	onOpen,
	selectedId,
}: {
	threads: Thread[];
	onOpen: (id: string) => void;
	selectedId: string | null;
}) {
	if (threads.length === 0) {
		return (
			<div className="rounded-lg border border-kumo-subtle bg-kumo-base p-6 text-center text-sm text-kumo-muted">
				No threads yet.
			</div>
		);
	}
	const sorted = [...threads].sort(
		(a, b) => rank(a.status) - rank(b.status),
	);
	return (
		<ul className="space-y-2">
			{sorted.map((t) => (
				<li key={t.id}>
					<button
						onClick={() => onOpen(t.id)}
						className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
							selectedId === t.id
								? "border-amber-400 bg-amber-50"
								: "border-kumo-subtle bg-kumo-base hover:border-kumo-default"
						}`}
					>
						<div className="flex items-center justify-between text-xs text-kumo-muted">
							<span className="uppercase tracking-wider">{t.status}</span>
							<span>{new Date(t.last_activity).toLocaleTimeString()}</span>
						</div>
						<div className="mt-1 text-kumo-default truncate">
							{t.subject ?? "(no subject)"}
						</div>
					</button>
				</li>
			))}
		</ul>
	);
}

function rank(status: string) {
	const order = [
		"awaiting", // needs-you-ish
		"booked",
		"active",
		"human",
		"parked",
		"declined",
	];
	const i = order.indexOf(status);
	return i === -1 ? 99 : i;
}

// ── Thread drawer ───────────────────────────────────────────────────

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
