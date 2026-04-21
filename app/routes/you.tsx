// "You" — lightweight user profile: name, role, bio. Agent prompts fold
// these into outreach so emails read as if the agent knows the user.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MissionsNav } from "~/components/MissionsNav";
import { missionsApi } from "~/services/missions-api";

export default function YouRoute() {
	const qc = useQueryClient();
	const meQ = useQuery({ queryKey: ["me"], queryFn: () => missionsApi.me() });
	const user = meQ.data?.user;

	const [name, setName] = useState("");
	const [role, setRole] = useState("");
	const [bio, setBio] = useState("");
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (user) {
			setName(user.name ?? "");
			setRole(user.role ?? "");
			setBio(user.bio ?? "");
		}
	}, [user]);

	const save = useMutation({
		mutationFn: () =>
			missionsApi.updateMe({
				name: name.trim() || null,
				role: role.trim() || null,
				bio: bio.trim() || null,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["me"] });
			setSaved(true);
			setTimeout(() => setSaved(false), 1500);
		},
	});

	const dirty =
		(user?.name ?? "") !== name ||
		(user?.role ?? "") !== role ||
		(user?.bio ?? "") !== bio;

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<MissionsNav />
			<main className="mx-auto max-w-2xl px-6 py-8">
				<h1 className="mb-1 text-2xl font-semibold text-kumo-strong">You</h1>
				<p className="mb-6 text-sm text-kumo-muted">
					Tell the agents who you are. This is woven into outreach so emails
					sound authentic.
				</p>

				<div className="space-y-5 rounded-lg border border-kumo-subtle bg-kumo-base p-5">
					<Field label="Your name">
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Luke Miles"
							className="w-full rounded-md border border-kumo-subtle bg-kumo-base px-3 py-2 text-sm text-kumo-default focus:border-amber-400 focus:outline-none"
						/>
					</Field>
					<Field label="What you do">
						<input
							value={role}
							onChange={(e) => setRole(e.target.value)}
							placeholder="Founder of Example, building X"
							className="w-full rounded-md border border-kumo-subtle bg-kumo-base px-3 py-2 text-sm text-kumo-default focus:border-amber-400 focus:outline-none"
						/>
					</Field>
					<Field
						label="About"
						hint="A short paragraph the agent can draw from. What you're working on, what you care about, anything useful for context."
					>
						<textarea
							value={bio}
							onChange={(e) => setBio(e.target.value)}
							rows={5}
							placeholder="I'm working on a tool that helps teams..."
							className="w-full resize-y rounded-md border border-kumo-subtle bg-kumo-base px-3 py-2 text-sm text-kumo-default focus:border-amber-400 focus:outline-none"
						/>
					</Field>
					{user?.email && (
						<div className="text-xs text-kumo-inactive">
							Signed in as {user.email}
						</div>
					)}
					<div className="flex items-center gap-3 pt-1">
						<button
							onClick={() => save.mutate()}
							disabled={!dirty || save.isPending}
							className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
						>
							{save.isPending ? "Saving…" : "Save"}
						</button>
						{saved && (
							<span className="text-xs text-emerald-600">Saved.</span>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<label className="mb-1 block text-xs font-medium uppercase tracking-wider text-kumo-muted">
				{label}
			</label>
			{children}
			{hint && <p className="mt-1 text-xs text-kumo-inactive">{hint}</p>}
		</div>
	);
}
