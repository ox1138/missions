// Missions dashboard — Needs you / Active / Completed groupings.

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { useEffect } from "react";
import { MissionsNav } from "~/components/MissionsNav";
import {
	getStoredMissionIds,
	missionsApi,
	type Mission,
} from "~/services/missions-api";

export default function MissionsIndex() {
	const navigate = useNavigate();
	const ids = typeof window !== "undefined" ? getStoredMissionIds() : [];

	const { data, isLoading } = useQuery({
		queryKey: ["missions", ids.join(",")],
		queryFn: () => missionsApi.listMissions(ids),
		enabled: ids.length > 0,
		refetchInterval: 5000,
	});

	const missions = data?.missions ?? [];

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

	const grouped = groupByPhase(missions);

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
				) : missions.length === 0 ? (
					<EmptyState />
				) : (
					<div className="space-y-10">
						<Section title="Needs you" missions={grouped.needsYou} accent="amber" />
						<Section title="Active" missions={grouped.active} />
						<Section
							title="Completed"
							missions={grouped.completed}
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
	missions,
	accent,
	dimmed,
	collapsible,
}: {
	title: string;
	missions: Mission[];
	accent?: "amber";
	dimmed?: boolean;
	collapsible?: boolean;
}) {
	if (missions.length === 0) return null;
	return (
		<section>
			<h2
				className={`mb-3 text-xs font-semibold uppercase tracking-wider ${
					accent === "amber"
						? "text-amber-700"
						: dimmed
						  ? "text-kumo-inactive"
						  : "text-kumo-muted"
				}`}
			>
				{title} · {missions.length}
			</h2>
			<div className="space-y-2">
				{missions.map((m) => (
					<MissionCard key={m.id} mission={m} dimmed={dimmed} />
				))}
			</div>
			{collapsible && null}
		</section>
	);
}

function MissionCard({ mission, dimmed }: { mission: Mission; dimmed?: boolean }) {
	const phaseLabel = prettyPhase(mission.phase);
	const agentRole = mission.agent_id.split(":")[1] ?? "otto";
	return (
		<Link
			to={`/missions/${mission.id}`}
			className={`block rounded-lg border border-kumo-subtle bg-kumo-base p-4 hover:border-kumo-default ${
				dimmed ? "opacity-70" : ""
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 text-xs">
						<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
							{agentRole}
						</span>
						<span className="text-kumo-muted">{phaseLabel}</span>
					</div>
					<p className="mt-1 truncate text-sm text-kumo-default">
						{mission.brief}
					</p>
				</div>
				<div className="whitespace-nowrap text-xs text-kumo-inactive">
					{formatRelative(mission.created_at)}
				</div>
			</div>
		</Link>
	);
}

function groupByPhase(missions: Mission[]) {
	const needsYou: Mission[] = [];
	const active: Mission[] = [];
	const completed: Mission[] = [];
	for (const m of missions) {
		if (m.phase === "awaiting-approval") needsYou.push(m);
		else if (m.phase === "complete" || m.phase === "cancelled") completed.push(m);
		else active.push(m);
	}
	return { needsYou, active, completed };
}

function prettyPhase(p: Mission["phase"]): string {
	switch (p) {
		case "draft":
			return "Draft";
		case "understand":
			return "Reading brief";
		case "research":
			return "Researching";
		case "awaiting-approval":
			return "Needs you";
		case "outreach":
			return "Reaching out";
		case "monitoring":
			return "Awaiting replies";
		case "handoff":
			return "Handoff pending";
		case "complete":
			return "Complete";
		case "paused":
			return "Paused";
		case "cancelled":
			return "Cancelled";
	}
}

function formatRelative(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const min = Math.floor(diff / 60000);
	if (min < 1) return "just now";
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	const d = Math.floor(hr / 24);
	return `${d}d`;
}
