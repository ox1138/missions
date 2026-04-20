// Agent profile — identity (read-only) + memory (read-only). Edit is a
// Phase 2 follow-up per the plan.

import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router";
import { MissionsNav } from "~/components/MissionsNav";
import { missionsApi, type AgentRole } from "~/services/missions-api";

export default function AgentDetail() {
	const { role } = useParams();
	const { data, isLoading } = useQuery({
		queryKey: ["agent", role],
		queryFn: () => missionsApi.getAgent(role as AgentRole),
		enabled: !!role,
	});

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-3xl px-6 py-8">
				<Link to="/agents" className="text-sm text-kumo-muted hover:text-kumo-default">
					← All agents
				</Link>
				{isLoading || !data ? (
					<div className="mt-6 text-kumo-muted">Loading…</div>
				) : (
					<>
						<div className="mt-4">
							<h1 className="text-2xl font-semibold text-kumo-strong">
								{data.identity.name}
							</h1>
							<p className="mt-1 text-sm text-kumo-muted">
								Sends as <code>{data.identity.email_local_part}@…</code>
							</p>
							<p className="mt-3 font-serif text-sm text-kumo-default leading-relaxed">
								{data.identity.bio}
							</p>
						</div>

						<section className="mt-8">
							<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
								Voice
							</h2>
							<p className="font-serif text-sm text-kumo-default">
								{data.identity.voice ?? "(not set)"}
							</p>
						</section>

						<section className="mt-6">
							<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
								Signature
							</h2>
							<pre className="font-serif text-sm text-kumo-default whitespace-pre-wrap">
								{data.identity.signature ?? "—"}
							</pre>
						</section>

						<section className="mt-8">
							<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-kumo-muted">
								Memory
							</h2>
							<MemorySection
								title="About you"
								items={data.memory?.about ?? []}
							/>
							<MemorySection
								title="Policies"
								items={data.memory?.policies ?? []}
							/>
							<MemorySection
								title="Topics"
								items={data.memory?.topics ?? []}
							/>
						</section>
					</>
				)}
			</main>
		</div>
	);
}

function MemorySection({
	title,
	items,
}: {
	title: string;
	items: { id: string; value: string; source: string; created_at: string }[];
}) {
	return (
		<div className="mb-4">
			<h3 className="text-sm font-medium text-kumo-strong">{title}</h3>
			{items.length === 0 ? (
				<p className="text-xs text-kumo-muted mt-1">
					Empty. The agent will add entries as it learns — you can edit here in v2.
				</p>
			) : (
				<ul className="mt-1 space-y-1">
					{items.map((e) => (
						<li key={e.id} className="font-serif text-sm text-kumo-default">
							• {e.value}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
