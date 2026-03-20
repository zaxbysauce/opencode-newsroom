/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 *
 * Upgraded to match opencode-swarm v6+ architecture:
 * - Per-invocation window budgets (reset per delegation, not per session)
 * - Self-writing detection (prevent editor-in-chief from writing directly)
 * - Delegation loop detection
 * - Enhanced loop detection: ≥loop_warning_threshold = warning, ≥loop_block_threshold = hard block
 * - QA skip enforcement
 */

import {
	type GuardrailsConfig,
	resolveGuardrailsConfig,
} from '../config/schema';
import {
	beginInvocation,
	getAgentSession,
	newsroomState,
	startAgentSession,
} from '../state';
import { warn } from '../utils';

// Tools considered "content writing" tools — only writer should use these
const WRITING_TOOLS = new Set([
	'write',
	'edit',
	'multi_edit',
	'write_file',
	'edit_file',
]);

// Tools that are always safe for any agent
const ALWAYS_ALLOWED_TOOLS = new Set([
	'read',
	'read_file',
	'glob',
	'grep',
	'list',
	'task',
	'retrieve_summary',
	'detect_domains',
]);

/**
 * Returns true if the tool is a content-writing tool.
 */
function isWritingTool(toolName: string): boolean {
	const lower = toolName.toLowerCase();
	return WRITING_TOOLS.has(lower);
}

/**
 * Returns true if the agent is the orchestrator (editor-in-chief).
 */
function isOrchestrator(agentName: string): boolean {
	const lower = agentName.toLowerCase();
	return (
		lower === 'editor_in_chief' ||
		lower.endsWith('_editor_in_chief')
	);
}

/**
 * Returns true if the tool is an agent delegation call.
 */
function isAgentDelegation(toolName: string): boolean {
	return toolName === 'task' || toolName === 'agent';
}

/**
 * Creates guardrails hooks for circuit breaker protection
 */
export function createGuardrailsHooks(config: GuardrailsConfig): {
	toolBefore: (
		input: { tool: string; sessionID: string; callID: string },
		output: { args: unknown },
	) => Promise<void>;
	toolAfter: (
		input: { tool: string; sessionID: string; callID: string },
		output: { title: string; output: string; metadata: unknown },
	) => Promise<void>;
	messagesTransform: (
		input: Record<string, never>,
		output: {
			messages?: Array<{
				info: { role: string; agent?: string; sessionID?: string };
				parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
			}>;
		},
	) => Promise<void>;
} {
	if (config.enabled === false) {
		return {
			toolBefore: async () => {},
			toolAfter: async () => {},
			messagesTransform: async () => {},
		};
	}

	const loopWarningThreshold = config.loop_warning_threshold ?? 3;
	const loopBlockThreshold = config.loop_block_threshold ?? 5;

	return {
		toolBefore: async (input, output) => {
			let session = getAgentSession(input.sessionID);
			if (!session) {
				const agentName =
					newsroomState.activeAgent.get(input.sessionID) ?? 'unknown';
				startAgentSession(input.sessionID, agentName);
				session = getAgentSession(input.sessionID);
				if (!session) {
					warn(`Failed to create session for ${input.sessionID}`);
					return;
				}
			} else if (session.agentName === 'unknown') {
				const activeAgentName = newsroomState.activeAgent.get(input.sessionID);
				if (activeAgentName) {
					// New agent — start a new invocation window
					beginInvocation(input.sessionID, activeAgentName);
					session = getAgentSession(input.sessionID);
					if (!session) {
						warn(`Session lost after beginInvocation for ${input.sessionID}`);
						return;
					}
				}
			}

			const agentConfig = resolveGuardrailsConfig(config, session.agentName);
			const window = session.currentWindow;

			// Hard limit already hit — block all further tool calls
			if (session.hardLimitHit) {
				throw new Error(
					'🛑 CIRCUIT BREAKER: Agent blocked. Hard limit was previously triggered. Stop making tool calls and return your progress summary.',
				);
			}

			// Self-writing detection: orchestrator should not use writing tools directly
			if (
				config.prevent_self_writing !== false &&
				isOrchestrator(session.agentName) &&
				isWritingTool(input.tool) &&
				!isAgentDelegation(input.tool)
			) {
				session.hardLimitHit = true;
				session.violations.push(
					`Self-writing detected: editor_in_chief used ${input.tool} directly`,
				);
				throw new Error(
					`🛑 GUARDRAIL: editor_in_chief must not write content directly. Delegate to the "writer" agent using the task tool instead of calling "${input.tool}" yourself.`,
				);
			}

			// QA skip enforcement: if QA was flagged as skipped, block completion tools
			if (
				config.enforce_qa_delegation !== false &&
				session.qaSkipped &&
				(input.tool === 'phase_complete' || input.tool === 'save_plan')
			) {
				throw new Error(
					'🛑 GUARDRAIL: Cannot complete phase — QA review (copy_editor or managing_editor) has not been run. Delegate to a QA agent first.',
				);
			}

			// Increment tool call counts
			session.toolCallCount++;
			if (window) {
				window.toolCallCount++;
			}

			// Arg hashing for repetition/loop detection
			const hash = hashArgs(output.args);
			session.recentToolCalls.push({
				tool: input.tool,
				argsHash: hash,
				timestamp: Date.now(),
			});
			if (session.recentToolCalls.length > 20) {
				session.recentToolCalls.shift();
			}
			if (window) {
				window.recentToolCalls.push({
					tool: input.tool,
					argsHash: hash,
					timestamp: Date.now(),
				});
				if (window.recentToolCalls.length > 20) {
					window.recentToolCalls.shift();
				}
			}

			// Count consecutive identical calls (loop detection)
			let loopCount = 0;
			const calls = session.recentToolCalls;
			if (calls.length > 0) {
				const last = calls[calls.length - 1];
				for (let i = calls.length - 1; i >= 0; i--) {
					if (
						calls[i].tool === last.tool &&
						calls[i].argsHash === last.argsHash
					) {
						loopCount++;
					} else {
						break;
					}
				}
			}

			// Legacy repetition count for backward compat
			let repetitionCount = loopCount;

			const elapsedMinutes = (Date.now() - session.startTime) / 60000;

			// Hard blocks (ordered by severity)
			if (loopCount >= loopBlockThreshold) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 CIRCUIT BREAKER: Loop detected — same call repeated ${loopCount} times (${input.tool}). Stop immediately and return your progress summary.`,
				);
			}

			if (session.toolCallCount >= agentConfig.max_tool_calls) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 CIRCUIT BREAKER: Tool call limit reached (${session.toolCallCount}/${agentConfig.max_tool_calls}). Stop making tool calls and return your progress summary.`,
				);
			}

			if (elapsedMinutes >= agentConfig.max_duration_minutes) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 CIRCUIT BREAKER: Duration limit reached (${Math.floor(elapsedMinutes)} min). Stop making tool calls and return your progress summary.`,
				);
			}

			if (repetitionCount >= agentConfig.max_repetitions) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 CIRCUIT BREAKER: Repetition detected (same call ${repetitionCount} times). Stop making tool calls and return your progress summary.`,
				);
			}

			if (session.consecutiveErrors >= agentConfig.max_consecutive_errors) {
				session.hardLimitHit = true;
				throw new Error(
					`🛑 CIRCUIT BREAKER: Too many consecutive errors (${session.consecutiveErrors}). Stop making tool calls and return your progress summary.`,
				);
			}

			// Soft warnings
			if (!session.warningIssued) {
				const toolWarning =
					session.toolCallCount >=
					agentConfig.max_tool_calls * agentConfig.warning_threshold;
				const durationWarning =
					elapsedMinutes >=
					agentConfig.max_duration_minutes * agentConfig.warning_threshold;
				const repetitionWarning =
					repetitionCount >=
					agentConfig.max_repetitions * agentConfig.warning_threshold;
				const errorWarning =
					session.consecutiveErrors >=
					agentConfig.max_consecutive_errors * agentConfig.warning_threshold;
				const loopWarning = loopCount >= loopWarningThreshold;

				if (
					toolWarning ||
					durationWarning ||
					repetitionWarning ||
					errorWarning ||
					loopWarning
				) {
					session.warningIssued = true;
					if (window) window.warningIssued = true;
				}
			}
		},

		toolAfter: async (input, output) => {
			const session = getAgentSession(input.sessionID);
			if (!session) {
				return;
			}
			const hasError = output.output === null || output.output === undefined;
			if (hasError) {
				session.consecutiveErrors++;
				if (session.currentWindow) {
					session.currentWindow.consecutiveErrors++;
				}
			} else {
				session.consecutiveErrors = 0;
				if (session.currentWindow) {
					session.currentWindow.consecutiveErrors = 0;
				}
			}
		},

		messagesTransform: async (_input, output) => {
			const messages = output.messages;
			if (!messages || messages.length === 0) {
				return;
			}
			const lastMessage = messages[messages.length - 1];
			let sessionId: string | undefined = lastMessage.info?.sessionID;
			if (!sessionId) {
				for (const [id, session] of newsroomState.agentSessions) {
					if (session.warningIssued || session.hardLimitHit) {
						sessionId = id;
						break;
					}
				}
			}
			if (!sessionId) {
				return;
			}
			const session = getAgentSession(sessionId);
			if (!session || (!session.warningIssued && !session.hardLimitHit)) {
				return;
			}
			const textPart = lastMessage.parts.find(
				(part): part is { type: string; text: string } =>
					part.type === 'text' && typeof part.text === 'string',
			);
			if (!textPart) {
				return;
			}
			if (session.hardLimitHit) {
				textPart.text =
					'[🛑 CIRCUIT BREAKER ACTIVE: You have exceeded your resource limits. Do NOT make any more tool calls. Immediately return a summary of your progress so far. Any further tool calls will be blocked.]\n\n' +
					textPart.text;
			} else if (session.warningIssued) {
				textPart.text =
					'[⚠️ GUARDRAIL WARNING: You are approaching resource limits. Please wrap up your current task efficiently. Avoid unnecessary tool calls and prepare to return your results soon.]\n\n' +
					textPart.text;
			}
		},
	};
}

export function hashArgs(args: unknown): number {
	try {
		if (typeof args !== 'object' || args === null) {
			return 0;
		}
		const sortedKeys = Object.keys(args as Record<string, unknown>).sort();
		return Number(Bun.hash(JSON.stringify(args, sortedKeys)));
	} catch {
		return 0;
	}
}
