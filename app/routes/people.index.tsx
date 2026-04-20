// People view — the cross-mission contact list. MVP is a simple table with
// suppression + outcome filtering.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MissionsNav } from "~/components/MissionsNav";
import { missionsApi, type Contact } from "~/services/missions-api";

export default function PeopleIndex() {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["contacts"],
		queryFn: () => missionsApi.listContacts(),
		refetchInterval: 10000,
	});
	const [filter, setFilter] = useState<"all" | "active" | "suppressed">("all");

	const suppress = useMutation({
		mutationFn: (email: string) => missionsApi.suppressContact(email),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
	});

	const contacts = data?.contacts ?? [];
	const filtered = contacts.filter((c) =>
		filter === "all" ? true : c.status === filter,
	);

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-6xl px-6 py-8">
				<div className="mb-6 flex items-center justify-between">
					<h1 className="text-2xl font-semibold text-kumo-strong">People</h1>
					<div className="flex items-center gap-2 text-sm">
						{(["all", "active", "suppressed"] as const).map((f) => (
							<button
								key={f}
								onClick={() => setFilter(f)}
								className={`rounded px-2 py-1 ${
									filter === f
										? "bg-kumo-base text-kumo-strong"
										: "text-kumo-muted hover:text-kumo-default"
								}`}
							>
								{f}
							</button>
						))}
					</div>
				</div>

				{isLoading ? (
					<div className="text-kumo-muted">Loading contacts…</div>
				) : filtered.length === 0 ? (
					<div className="rounded-lg border border-kumo-subtle bg-kumo-base p-8 text-center text-kumo-muted">
						No contacts yet. They'll show up here after your first mission.
					</div>
				) : (
					<div className="rounded-lg border border-kumo-subtle bg-kumo-base overflow-hidden">
						<table className="w-full text-sm">
							<thead className="bg-kumo-recessed text-left text-xs uppercase tracking-wider text-kumo-muted">
								<tr>
									<th className="px-4 py-2 font-medium">Name / Email</th>
									<th className="px-4 py-2 font-medium">Interactions</th>
									<th className="px-4 py-2 font-medium">Last outcome</th>
									<th className="px-4 py-2 font-medium">Status</th>
									<th className="px-4 py-2" />
								</tr>
							</thead>
							<tbody className="divide-y divide-kumo-subtle">
								{filtered.map((c) => (
									<ContactRow
										key={c.id}
										c={c}
										onSuppress={() => suppress.mutate(c.email)}
									/>
								))}
							</tbody>
						</table>
					</div>
				)}
			</main>
		</div>
	);
}

function ContactRow({
	c,
	onSuppress,
}: {
	c: Contact;
	onSuppress: () => void;
}) {
	return (
		<tr className={c.status === "suppressed" ? "opacity-60" : ""}>
			<td className="px-4 py-2">
				<div className="text-kumo-strong">{c.name ?? c.email}</div>
				{c.name && (
					<div className="text-xs text-kumo-muted">{c.email}</div>
				)}
			</td>
			<td className="px-4 py-2 text-kumo-default">
				{c.total_interactions}
			</td>
			<td className="px-4 py-2 text-kumo-default">
				{c.last_outcome ?? "—"}
			</td>
			<td className="px-4 py-2">
				<span
					className={`rounded-full px-2 py-0.5 text-xs ${
						c.status === "active"
							? "bg-green-100 text-green-800"
							: "bg-kumo-recessed text-kumo-muted"
					}`}
				>
					{c.status}
				</span>
			</td>
			<td className="px-4 py-2 text-right">
				{c.status === "active" && (
					<button
						onClick={onSuppress}
						className="rounded-md border border-kumo-subtle px-2 py-1 text-xs text-kumo-muted hover:text-red-700"
					>
						Suppress
					</button>
				)}
			</td>
		</tr>
	);
}
