// First-run bootstrap — ensures the single user row and the three agent
// identities exist. Idempotent; safe to call on every request that lands
// on the API.

import type { Env } from "../../types";
import { DEFAULT_USER_ID, agentDoKey } from "../index";
import type { AgentRole } from "../db/agent-schema";

export interface BootstrapInput {
	email: string;
	name?: string;
	domain: string;
}

export async function ensureBootstrapped(
	env: Env,
	input: BootstrapInput,
): Promise<void> {
	// User
	const userStub = env.USER_DO.get(env.USER_DO.idFromName(DEFAULT_USER_ID));
	await userStub.ensureUser({
		userId: DEFAULT_USER_ID,
		email: input.email,
		name: input.name,
		domain: input.domain,
	});

	// Three agents — all created, only Otto is wired into a workflow in v1.
	const roles: AgentRole[] = ["otto", "mara", "iris"];
	await Promise.all(
		roles.map(async (role) => {
			const id = agentDoKey(DEFAULT_USER_ID, role);
			const stub = env.AGENT_DO.get(env.AGENT_DO.idFromName(id));
			await stub.ensureIdentity({ id, userId: DEFAULT_USER_ID, role });
		}),
	);
}
