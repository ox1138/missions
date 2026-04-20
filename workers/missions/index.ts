// Public exports from the Missions layer. New DO classes are registered in
// wrangler.jsonc and re-exported from workers/app.ts so the runtime can
// instantiate them by name.

export { UserDO } from "./user-do";
export { AgentDO, AGENT_DEFAULTS } from "./agent-do";
export { MissionDO } from "./mission-do";

export type {
	AgentIdentity,
	AgentMemory,
} from "./agent-do";
export type {
	ContactRow,
	ContactActivityRow,
	RecordInteractionInput,
} from "./user-do";
export type {
	MissionRow,
	TargetRow,
	ThreadRow,
	MessageRow,
	ApprovalRow,
	ActivityEventRow,
	ResearchLogRow,
} from "./mission-do";
export type {
	ContactOutcome,
	ContactStatus,
	ContactActivityType,
} from "./db/user-schema";
export type {
	MissionPhase,
	ThreadStatus,
	TargetStatus,
	ApprovalType,
	ApprovalStatus,
} from "./db/mission-schema";
export type { AgentRole, MemoryEntry } from "./db/agent-schema";

export const DEFAULT_USER_ID = "default";
export function agentDoKey(userId: string, role: "otto" | "mara" | "iris") {
	return `${userId}:${role}`;
}
