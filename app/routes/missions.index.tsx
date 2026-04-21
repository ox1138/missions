// Missions dashboard — Needs you / Active / Completed groupings. Each card
// is a progress summary: brief, stats (sent/replies/threads), started date,
// friendly phase chip. Completed group is collapsed by default and each
// mission can be deleted permanently.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { MissionsNav } from "~/components/MissionsNav";
import {
	getStoredMissionIds,
	missionsApi,
	type MissionSummary,
} from "~/services/missions-api";
import { phaseLabel } from "~/lib/activity-labels";

export default function MissionsIndex() {
	const navigate = useNavigate();
	const ids = typeof window !== "undefined" ? getStoredMissionIds() : [];

	const { data, isLoading } = useQuery({
		queryKey: ["missions", ids.join(",")],
		queryFn: () => missionsApi.listMissions(ids),
		enabled: ids.length > 0,
		refetchInterval: 5000,
	});

	const summaries = data?.missions ?? [];

	// Auto-bootstrap on first visit so the user/agent rows exist before any
	// mission is created.
	useEffect(() => {
		missionsApi.me().then(async ({ user }) => {
			if (!user) {
				const domain = window.location.hostname;
				await missionsApi.bootstrap({
					email: `you@${domain === "localhost" ? "example.com" : domain}`,
					name: "You",
					domain: domain === "localhost" ? "example.com" : domain,
				});
			}
		}).catch(() => {});
	}, []);

	const grouped = groupByPhase(summaries);

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-6xl px-6 py-8">
				<div className="flex items-center justify-between mb-6">
					<h1 className="text-2xl font-semibold text-kumo-strong">
						Your missions
					</h1>
					<button
						onClick={() => navigate("/missions/new")}
						className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
					>
						New mission
					</button>
				</div>

				{isLoading && ids.length > 0 ? (
					<div className="text-kumo-muted">Loading…</div>
				) : summaries.length === 0 ? (
					<EmptyState />
				) : (
					<div className="space-y-8">
						<Section
							title="Needs you"
							summaries={grouped.needsYou}
							accent="amber"
						/>
						<Section title="Active" summaries={grouped.active} />
						<Section
							title="Completed"
							summaries={grouped.completed}
							dimmed
							collapsible
						/>
					</div>
				)}
			</main>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="rounded-lg border border-kumo-subtle bg-kumo-base p-12 text-center">
			<p className="text-kumo-muted mb-4">
				No missions yet. Give Otto something to work on.
			</p>
			<Link
				to="/missions/new"
				className="inline-flex rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			>
				Create your first mission
			</Link>
		</div>
	);
}

function Section({
	title,
	summaries,
	accent,
	dimmed,
	collapsible,
}: {
	title: string;
	summaries: MissionSummary[];
	accent?: "amber";
	dimmed?: boolean;
	collapsible?: boolean;
}) {
	const [open, setOpen] = useState(!collapsible);
	if (summaries.length === 0) return null;

	const header = (
		<h2
			className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
				accent === "amber"
					? "text-amber-700"
					: dimmed
						? "text-kumo-inactive"
						: "text-kumo-muted"
			}`}
		>
			<span>
				{title} · {summaries.length}
			</span>
		</h2>
	);

	return (
		<section>
			{collapsible ? (
				<button
					onClick={() => setOpen((o) => !o)}
					className="mb-3 flex w-full items-center justify-between text-left"
				>
					{header}
					<span className="text-xs text-kumo-inactive">
						{open ? "Hide" : "Show"}
					</span>
				</button>
			) : (
				<div className="mb-3">{header}</div>
			)}
			{(!collapsible || open) && (
				<div className="space-y-2">
					{summaries.map((s) => (
						<MissionCard key={s.mission.id} summary={s} dimmed={dimmed} />
					))}
				</div>
			)}
		</section>
	);
}

function MissionCard({
	summary,
	dimmed,
}: {
	summary: MissionSummary;
	dimmed?: boolean;
}) {
	const qc = useQueryClient();
	const { mission, emails_sent, replies_received, thread_count } = summary;
	const agentRole = mission.agent_id.split(":")[1] ?? "otto";
	const remove = useMutation({
		mutationFn: () => missionsApi.deleteMission(mission.id),
		onSuccess: () => {
			dropStoredMissionId(mission.id);
			qc.invalidateQueries({ queryKey: ["missions"] });
		},
	});

	return (
		<div
			className={`group relative rounded-lg border border-kumo-subtle bg-kumo-base p-4 transition hover:border-kumo-default ${
				dimmed ? "opacity-70" : ""
			}`}
		>
			<Link to={`/missions/${mission.id}`} className="block">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 text-xs">
							<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
								{agentRole}
							</span>
							<span className="rounded-full border border-kumo-subtle px-2 py-0.5 text-kumo-muted">
								{phaseLabel(mission.phase)}
							</span>
						</div>
						<p className="mt-2 font-serif text-base text-kumo-default leading-snug line-clamp-2">
							{mission.brief}
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-kumo-muted">
							<span>{emails_sent} sent</span>
							<span className="text-kumo-inactive">·</span>
							<span>
								{replies_received} repl{replies_received === 1 ? "y" : "ies"}
							</span>
							<span className="text-kumo-inactive">·</span>
							<span>
								{thread_count} thread{thread_count === 1 ? "" : "s"}
							</span>
							<span className="text-kumo-inactive">·</span>
							<span>started {formatRelative(mission.created_at)}</span>
						</div>
					</div>
				</div>
			</Link>
			<button
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					if (
						confirm(
							"Delete this mission permanently? Threads and activity will be removed.",
						)
					) {
						remove.mutate();
					}
				}}
				aria-label="Delete mission"
				className="absolute right-3 top-3 rounded-md border border-transparent px-2 py-0.5 text-xs text-kumo-inactive opacity-0 transition-opacity hover:border-red-200 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
			>
				Delete
			</button>
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

function groupByPhase(summaries: MissionSummary[]) {
	const needsYou: MissionSummary[] = [];
	const active: MissionSummary[] = [];
	const completed: MissionSummary[] = [];
	for (const s of summaries) {
		const phase = s.mission.phase;
		if (phase === "awaiting-approval") needsYou.push(s);
		else if (phase === "complete" || phase === "cancelled") completed.push(s);
		else active.push(s);
	}
	return { needsYou, active, completed };
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
