/**
 * System Enhancer Hook
 *
 * Enhances the system prompt with current phase information from the plan
 * and cross-agent context from the activity log.
 * Reads plan.md and injects phase context into the system prompt.
 */

import type { PluginConfig } from '../config';
import { stripKnownNewsroomPrefix } from '../config/schema';
import { loadPlan } from '../plan/manager';
import { newsroomState } from '../state';
import { warn } from '../utils';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
	extractCurrentTask,
	extractCurrentTaskFromPlan,
	extractDecisions,
} from './extractors';
import { estimateTokens, readNewsroomFileAsync, safeHook } from './utils';

/**
 * Creates the experimental.chat.system.transform hook for system enhancement.
 */
export function createSystemEnhancerHook(
	config: PluginConfig,
	directory: string,
): Record<string, unknown> {
	const enabled = config.hooks?.system_enhancer !== false;

	if (!enabled) {
		return {};
	}

	return {
		'experimental.chat.system.transform': safeHook(
			async (
				_input: { sessionID?: string; model?: unknown },
				output: { system: string[] },
			): Promise<void> => {
				try {
					const maxInjectionTokens =
						config.context_budget?.max_injection_tokens ??
						Number.POSITIVE_INFINITY;
					let injectedTokens = 0;

					function tryInject(text: string): void {
						const tokens = estimateTokens(text);
						if (injectedTokens + tokens > maxInjectionTokens) {
							return;
						}
						output.system.push(text);
						injectedTokens += tokens;
					}

					const contextContent = await readNewsroomFileAsync(
						directory,
						'context.md',
					);

					// Priority 1: Current phase
					const plan = await loadPlan(directory);
					if (plan && plan.migration_status !== 'migration_failed') {
						const currentPhase = extractCurrentPhaseFromPlan(plan);
						if (currentPhase) {
							tryInject(`[NEWSROOM CONTEXT] Current phase: ${currentPhase}`);
						}
						// Priority 2: Current task
						const currentTask = extractCurrentTaskFromPlan(plan);
						if (currentTask) {
							tryInject(`[NEWSROOM CONTEXT] Current task: ${currentTask}`);
						}
					} else {
						const planContent = await readNewsroomFileAsync(directory, 'plan.md');
						if (planContent) {
							const currentPhase = extractCurrentPhase(planContent);
							if (currentPhase) {
								tryInject(`[NEWSROOM CONTEXT] Current phase: ${currentPhase}`);
							}
							const currentTask = extractCurrentTask(planContent);
							if (currentTask) {
								tryInject(`[NEWSROOM CONTEXT] Current task: ${currentTask}`);
							}
						}
					}

					// Priority 3: Decisions
					if (contextContent) {
						const decisions = extractDecisions(contextContent, 200);
						if (decisions) {
							tryInject(`[NEWSROOM CONTEXT] Key decisions: ${decisions}`);
						}

						// Priority 4 (lowest): Agent context
						if (config.hooks?.agent_activity !== false && _input.sessionID) {
							const activeAgent = newsroomState.activeAgent.get(_input.sessionID);
							if (activeAgent) {
								const agentContext = extractAgentContext(
									contextContent,
									activeAgent,
									config.hooks?.agent_awareness_max_chars ?? 300,
								);
								if (agentContext) {
									tryInject(`[NEWSROOM AGENT CONTEXT] ${agentContext}`);
								}
							}
						}
					}
				} catch (error) {
					warn('System enhancer failed:', error);
				}
			},
		),
	};
}

/**
 * Extracts relevant cross-agent context based on the active agent.
 * Returns a truncated string of context relevant to the current agent.
 */
function extractAgentContext(
	contextContent: string,
	activeAgent: string,
	maxChars: number,
): string | null {
	// Find the ## Agent Activity section
	const activityMatch = contextContent.match(
		/## Agent Activity\n([\s\S]*?)(?=\n## |$)/,
	);
	if (!activityMatch) return null;

	const activitySection = activityMatch[1].trim();
	if (!activitySection || activitySection === 'No tool activity recorded yet.')
		return null;

	// Build context summary based on which agent is currently active
	// Strip newsroom prefix to get the base agent name
	const agentName = stripKnownNewsroomPrefix(activeAgent);

	let contextSummary: string;
	switch (agentName) {
		case 'writer':
			contextSummary = `Recent tool activity for review context:\n${activitySection}`;
			break;
		case 'copy_editor':
			contextSummary = `Tool usage to review:\n${activitySection}`;
			break;
		case 'fact_checker':
			contextSummary = `Tool activity for test context:\n${activitySection}`;
			break;
		default:
			contextSummary = `Agent activity summary:\n${activitySection}`;
			break;
	}

	// Truncate to max chars
	if (contextSummary.length > maxChars) {
		return `${contextSummary.substring(0, maxChars - 3)}...`;
	}

	return contextSummary;
}
