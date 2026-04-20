// Mission creation — a single text field plus agent selector. Per the PRD:
// "Mission creation is a single text field + agent selector; agent begins
// work immediately without further user input for clear briefs."

import { useState } from "react";
import { useNavigate } from "react-router";
import { MissionsNav } from "~/components/MissionsNav";
import {
	missionsApi,
	rememberMissionId,
	type AgentRole,
} from "~/services/missions-api";

export default function MissionsNew() {
	const navigate = useNavigate();
	const [brief, setBrief] = useState("");
	const [agentRole, setAgentRole] = useState<AgentRole>("otto");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const { mission_id } = await missionsApi.createMission({
				brief: brief.trim(),
				agent_role: agentRole,
			});
			rememberMissionId(mission_id);
			navigate(`/missions/${mission_id}`);
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-2xl px-6 py-8">
				<h1 className="text-2xl font-semibold text-kumo-strong mb-6">
					New mission
				</h1>
				<form onSubmit={handleSubmit} className="space-y-6">
					<div>
						<label className="block text-sm font-medium text-kumo-strong mb-2">
							What do you want done?
						</label>
						<textarea
							value={brief}
							onChange={(e) => setBrief(e.target.value)}
							placeholder="e.g. Get me booked on 3 podcasts about AI and creative work."
							rows={6}
							className="w-full rounded-md border border-kumo-subtle bg-kumo-base px-3 py-2 text-sm font-serif text-kumo-default focus:border-amber-600 focus:outline-none"
							required
						/>
						<p className="mt-2 text-xs text-kumo-muted">
							Plain language. The agent will ask if anything is genuinely
							ambiguous, otherwise it starts immediately.
						</p>
					</div>

					<div>
						<div className="text-sm font-medium text-kumo-strong mb-2">
							Which agent?
						</div>
						<div className="grid grid-cols-3 gap-2">
							{(["otto", "mara", "iris"] as AgentRole[]).map((role) => (
								<AgentPill
									key={role}
									role={role}
									selected={agentRole === role}
									onSelect={() => setAgentRole(role)}
								/>
							))}
						</div>
					</div>

					{error && (
						<div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
							{error}
						</div>
					)}

					<div className="flex items-center gap-3">
						<button
							type="submit"
							disabled={submitting || brief.trim().length < 6}
							className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-amber-700"
						>
							{submitting ? "Starting…" : "Start mission"}
						</button>
						<button
							type="button"
							onClick={() => navigate("/")}
							className="text-sm text-kumo-muted hover:text-kumo-default"
						>
							Cancel
						</button>
					</div>
				</form>
			</main>
		</div>
	);
}

function AgentPill({
	role,
	selected,
	onSelect,
}: {
	role: AgentRole;
	selected: boolean;
	onSelect: () => void;
}) {
	const enabled = role === "otto"; // Only Otto in v1 per plan.
	const meta: Record<AgentRole, { title: string; sub: string }> = {
		otto: { title: "Otto", sub: "Writes emails. Handles replies. Introduces you when a thread warms up." },
		mara: { title: "Mara", sub: "Researches. No outreach. (Coming later.)" },
		iris: { title: "Iris", sub: "Watches signals. Pings when something changes. (Coming later.)" },
	};
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={!enabled}
			className={`rounded-lg border p-3 text-left disabled:opacity-40 ${
				selected
					? "border-amber-600 bg-amber-50"
					: "border-kumo-subtle bg-kumo-base hover:border-kumo-default"
			}`}
		>
			<div className="text-sm font-medium text-kumo-strong">
				{meta[role].title}
			</div>
			<div className="mt-1 text-xs text-kumo-muted leading-snug">
				{meta[role].sub}
			</div>
		</button>
	);
}
