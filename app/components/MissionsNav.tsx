// Top nav shared across the three missions pages: Missions / People / Agents.

import { NavLink } from "react-router";

const tabs = [
	{ to: "/", label: "Missions", end: true },
	{ to: "/people", label: "People", end: false },
	{ to: "/agents", label: "Agents", end: false },
];

export function MissionsNav() {
	return (
		<header className="border-b border-kumo-subtle bg-kumo-base">
			<div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
				<div className="flex items-center gap-6">
					<div className="font-semibold tracking-tight text-kumo-strong">
						Missions
					</div>
					<nav className="flex items-center gap-4 text-sm">
						{tabs.map((t) => (
							<NavLink
								key={t.to}
								to={t.to}
								end={t.end}
								className={({ isActive }) =>
									isActive
										? "text-kumo-strong font-medium"
										: "text-kumo-muted hover:text-kumo-default"
								}
							>
								{t.label}
							</NavLink>
						))}
					</nav>
				</div>
			</div>
		</header>
	);
}
