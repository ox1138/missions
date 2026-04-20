// Agents landing — three cards, one per role.

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { MissionsNav } from "~/components/MissionsNav";
import { missionsApi, type AgentIdentity } from "~/services/missions-api";

const ACCENT: Record<string, string> = {
	otto: "bg-amber-100 text-amber-800 border-amber-300",
	mara: "bg-slate-100 text-slate-800 border-slate-300",
	iris: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

export default function AgentsIndex() {
	const { data, isLoading } = useQuery({
		queryKey: ["agents"],
		queryFn: () => missionsApi.listAgents(),
	});

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-6xl px-6 py-8">
				<h1 className="mb-6 text-2xl font-semibold text-kumo-strong">Agents</h1>
				{isLoading ? (
					<div className="text-kumo-muted">Loading…</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{(data?.agents ?? []).map((a: AgentIdentity) => (
							<Link
								key={a.id}
								to={`/agents/${a.role}`}
								className="rounded-lg border border-kumo-subtle bg-kumo-base p-5 hover:border-kumo-default"
							>
								<div
									className={`mb-3 inline-block rounded-full border px-3 py-0.5 text-xs font-medium ${
										ACCENT[a.role] ?? ""
									}`}
								>
									{a.role}
								</div>
								<div className="text-lg font-semibold text-kumo-strong">
									{a.name}
								</div>
								<p className="mt-1 text-sm text-kumo-muted leading-snug">
									{a.bio}
								</p>
							</Link>
						))}
					</div>
				)}
			</main>
		</div>
	);
}
