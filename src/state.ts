/**
 * Shared state module for OpenCode Newsroom plugin.
 * Provides a module-scoped singleton for cross-hook state sharing.
 *
 * Upgraded to match opencode-swarm v6+ architecture:
 * - Per-invocation windows (isolated guardrail budgets per delegation)
 * - Task workflow progression (idle → writer_delegated → copy_edit_run → … → complete)
 * - Anti-violation detection and gate logging
 * - Session rehydration from .newsroom/plan.json
 * - Session eviction at 2h (up from 60min)
 */

/**
 * Represents a single tool call entry for tracking purposes
 */
export interface ToolCallEntry {
	tool: string;
	sessionID: string;
	callID: string;
	startTime: number;
}

/**
 * Aggregated statistics for a specific tool
 */
export interface ToolAggregate {
	tool: string;
	count: number;
	successCount: number;
	failureCount: number;
	totalDuration: number;
}

/**
 * Represents a delegation from one agent to another
 */
export interface DelegationEntry {
	from: string;
	to: string;
	timestamp: number;
}

/**
 * Task workflow states — must progress strictly forward.
 * idle → writer_delegated → copy_edit_run → fact_check_run → humanizer_run → complete
 */
export type TaskWorkflowState =
	| 'idle'
	| 'writer_delegated'
	| 'copy_edit_run'
	| 'fact_check_run'
	| 'humanizer_run'
	| 'complete';

const TASK_WORKFLOW_ORDER: TaskWorkflowState[] = [
	'idle',
	'writer_delegated',
	'copy_edit_run',
	'fact_check_run',
	'humanizer_run',
	'complete',
];

/**
 * Per-invocation window — isolated guardrail budget for a single delegation.
 * Resets when a new agent is delegated to.
 */
export interface InvocationWindow {
	windowId: string;
	agentName: string;
	startTime: number;
	toolCallCount: number;
	consecutiveErrors: number;
	recentToolCalls: Array<{ tool: string; argsHash: number; timestamp: number }>;
	warningIssued: boolean;
	hardLimitHit: boolean;
	violations: string[];
}

/**
 * Represents per-session state for guardrail tracking
 */
export interface AgentSessionState {
	/** Which agent this session belongs to */
	agentName: string;

	/** Date.now() when session started */
	startTime: number;

	/** Total tool calls in this session (cumulative across windows) */
	toolCallCount: number;

	/** Consecutive errors (reset on success) */
	consecutiveErrors: number;

	/** Circular buffer of recent tool calls, max 20 entries */
	recentToolCalls: Array<{ tool: string; argsHash: number; timestamp: number }>;

	/** Whether a soft warning has been issued for the current window */
	warningIssued: boolean;

	/** Whether a hard limit has been triggered */
	hardLimitHit: boolean;

	/** Current invocation window (per-delegation budget) */
	currentWindow: InvocationWindow | null;

	/** All invocation windows for this session */
	windows: InvocationWindow[];

	/** Task workflow state for editorial pipeline tracking */
	taskWorkflow: TaskWorkflowState;

	/** Recorded quality gate results */
	gateLog: Array<{ gate: string; passed: boolean; timestamp: number }>;

	/** Detected guardrail violations */
	violations: string[];

	/** Whether QA stage has been skipped (triggers enforcement) */
	qaSkipped: boolean;
}

/**
 * Singleton state object for sharing data across hooks
 */
export const newsroomState = {
	/** Active tool calls — keyed by callID for before→after correlation */
	activeToolCalls: new Map<string, ToolCallEntry>(),

	/** Aggregated tool usage stats — keyed by tool name */
	toolAggregates: new Map<string, ToolAggregate>(),

	/** Active agent per session — keyed by sessionID, updated by chat.message hook */
	activeAgent: new Map<string, string>(),

	/** Delegation chains per session — keyed by sessionID */
	delegationChains: new Map<string, DelegationEntry[]>(),

	/** Number of events since last flush */
	pendingEvents: 0,

	/** Per-session guardrail state — keyed by sessionID */
	agentSessions: new Map<string, AgentSessionState>(),
};

/**
 * Reset all state to initial values - useful for testing
 */
export function resetNewsroomState(): void {
	newsroomState.activeToolCalls.clear();
	newsroomState.toolAggregates.clear();
	newsroomState.activeAgent.clear();
	newsroomState.delegationChains.clear();
	newsroomState.pendingEvents = 0;
	newsroomState.agentSessions.clear();
}

function createInvocationWindow(
	windowId: string,
	agentName: string,
): InvocationWindow {
	return {
		windowId,
		agentName,
		startTime: Date.now(),
		toolCallCount: 0,
		consecutiveErrors: 0,
		recentToolCalls: [],
		warningIssued: false,
		hardLimitHit: false,
		violations: [],
	};
}

/**
 * Start a new agent session with initialized guardrail state.
 * Also removes any stale sessions older than staleDurationMs (default: 2h).
 * @param sessionId - The session identifier
 * @param agentName - The agent associated with this session
 * @param staleDurationMs - Age threshold for stale session eviction (default: 2h = 7200000ms)
 */
export function startAgentSession(
	sessionId: string,
	agentName: string,
	staleDurationMs = 7200000,
): void {
	const now = Date.now();

	// Evict stale sessions (collect first to avoid delete-during-iteration)
	const staleIds: string[] = [];
	for (const [id, session] of newsroomState.agentSessions) {
		if (now - session.startTime > staleDurationMs) {
			staleIds.push(id);
		}
	}
	for (const id of staleIds) {
		newsroomState.agentSessions.delete(id);
	}

	const windowId = `${sessionId}-w0`;
	const initialWindow = createInvocationWindow(windowId, agentName);

	const sessionState: AgentSessionState = {
		agentName,
		startTime: now,
		toolCallCount: 0,
		consecutiveErrors: 0,
		recentToolCalls: [],
		warningIssued: false,
		hardLimitHit: false,
		currentWindow: initialWindow,
		windows: [initialWindow],
		taskWorkflow: 'idle',
		gateLog: [],
		violations: [],
		qaSkipped: false,
	};

	newsroomState.agentSessions.set(sessionId, sessionState);
}

/**
 * Begin a new invocation window for a session when a new agent is delegated to.
 * This resets per-window counters while preserving cumulative session data.
 */
export function beginInvocation(sessionId: string, agentName: string): void {
	const session = newsroomState.agentSessions.get(sessionId);
	if (!session) return;

	const windowIndex = session.windows.length;
	const windowId = `${sessionId}-w${windowIndex}`;
	const window = createInvocationWindow(windowId, agentName);

	session.currentWindow = window;
	session.windows.push(window);
	session.agentName = agentName;
	// Reset per-window state on the session (mirrors current window)
	session.warningIssued = false;
	// NOTE: hardLimitHit is NOT reset — once hit it stays hit for the session
}

/**
 * End an agent session by removing it from the state.
 */
export function endAgentSession(sessionId: string): void {
	newsroomState.agentSessions.delete(sessionId);
}

/**
 * Get an agent session state by session ID.
 */
export function getAgentSession(
	sessionId: string,
): AgentSessionState | undefined {
	return newsroomState.agentSessions.get(sessionId);
}

/**
 * Advances the task workflow state for a session.
 * States must advance in order — skipping or reversing is rejected.
 * Returns true if the advance succeeded, false if the transition is invalid.
 */
export function advanceTaskState(
	sessionId: string,
	nextState: TaskWorkflowState,
): boolean {
	const session = newsroomState.agentSessions.get(sessionId);
	if (!session) return false;

	const currentIdx = TASK_WORKFLOW_ORDER.indexOf(session.taskWorkflow);
	const nextIdx = TASK_WORKFLOW_ORDER.indexOf(nextState);

	if (nextIdx !== currentIdx + 1) {
		// Must advance exactly one step — skipping or reversing is rejected
		session.violations.push(
			`Invalid workflow transition: ${session.taskWorkflow} → ${nextState}`,
		);
		return false;
	}

	session.taskWorkflow = nextState;
	return true;
}

/**
 * Records a quality gate result for a session.
 */
export function logGateResult(
	sessionId: string,
	gate: string,
	passed: boolean,
): void {
	const session = newsroomState.agentSessions.get(sessionId);
	if (!session) return;
	session.gateLog.push({ gate, passed, timestamp: Date.now() });
}

/**
 * Marks that the QA stage was skipped for a session (triggers enforcement).
 */
export function markQASkipped(sessionId: string): void {
	const session = newsroomState.agentSessions.get(sessionId);
	if (!session) return;
	session.qaSkipped = true;
	session.violations.push('QA stage skipped without completing copy_edit or managing_editor review');
}

/**
 * Attempts to rehydrate session state from .newsroom/plan.json.
 * Used on plugin startup to recover workflow state from disk.
 *
 * @param sessionId - The session to rehydrate into
 * @param directory - The project directory containing .newsroom/
 */
export async function rehydrateSessionFromDisk(
	sessionId: string,
	directory: string,
): Promise<void> {
	try {
		const { loadPlanJsonOnly } = await import('./plan/manager');
		const plan = await loadPlanJsonOnly(directory);
		if (!plan) return;

		let session = newsroomState.agentSessions.get(sessionId);
		if (!session) {
			startAgentSession(sessionId, 'editor_in_chief');
			session = newsroomState.agentSessions.get(sessionId);
			if (!session) return;
		}

		// Derive workflow state from plan: if any task is in_progress, we're mid-pipeline
		let hasInProgress = false;
		let hasCompleted = false;
		for (const phase of plan.phases) {
			for (const task of phase.tasks) {
				if (task.status === 'in_progress') hasInProgress = true;
				if (task.status === 'completed') hasCompleted = true;
			}
		}

		if (hasInProgress) {
			session.taskWorkflow = 'writer_delegated';
		} else if (hasCompleted) {
			session.taskWorkflow = 'copy_edit_run';
		}
	} catch {
		// Rehydration is best-effort — failures are silent
	}
}
