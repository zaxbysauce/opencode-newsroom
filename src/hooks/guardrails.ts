/**
 * Guardrails Hook Module
 *
 * Circuit breaker for runaway LLM agents. Monitors tool usage via OpenCode Plugin API hooks
 * and implements two-layer protection:
 * - Layer 1 (Soft Warning @ warning_threshold): Sets warning flag for messagesTransform to inject warning
 * - Layer 2 (Hard Block @ 100%): Throws error in toolBefore to block further calls, injects STOP message
 */

import {
	type GuardrailsConfig,
	resolveGuardrailsConfig,
} from '../config/schema';
import { getAgentSession, startAgentSession, newsroomState } from '../state';
import { warn } from '../utils';

/**
 * Creates guardrails hooks for circuit breaker protection
 * @param config Guardrails configuration
 * @returns Tool before/after hooks and messages transform hook
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
					session.agentName = activeAgentName;
					session.startTime = Date.now();
				}
			}

			const agentConfig = resolveGuardrailsConfig(config, session.agentName);

			if (session.hardLimitHit) {
				throw new Error(
					'🛑 CIRCUIT BREAKER: Agent blocked. Hard limit was previously triggered. Stop making tool calls and return your progress summary.',
				);
			}

			session.toolCallCount++;

			const hash = hashArgs(output.args);

			session.recentToolCalls.push({
				tool: input.tool,
				argsHash: hash,
				timestamp: Date.now(),
			});
			if (session.recentToolCalls.length > 20) {
				session.recentToolCalls.shift();
			}

			let repetitionCount = 0;
			if (session.recentToolCalls.length > 0) {
				const lastEntry =
					session.recentToolCalls[session.recentToolCalls.length - 1];
				for (let i = session.recentToolCalls.length - 1; i >= 0; i--) {
					const entry = session.recentToolCalls[i];
					if (
						entry.tool === lastEntry.tool &&
						entry.argsHash === lastEntry.argsHash
					) {
						repetitionCount++;
					} else {
						break;
					}
				}
			}

			const elapsedMinutes = (Date.now() - session.startTime) / 60000;

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

				if (
					toolWarning ||
					durationWarning ||
					repetitionWarning ||
					errorWarning
				) {
					session.warningIssued = true;
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
			} else {
				session.consecutiveErrors = 0;
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
