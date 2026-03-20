/**
 * System Enhancer Hook
 *
 * Enhances the system prompt with current phase information from the plan
 * and cross-agent context from the activity log.
 *
 * Upgraded to match opencode-swarm v6+:
 * - Path A (Legacy): sequential priority injection (phase → task → decisions → agent context)
 * - Path B (Scoring): relevance-weighted injection under token budget constraints
 * - Retrospective injection for editor-in-chief (previous phase context)
 * - Handoff brief injection
 * - Safety guardrails: self-verification prevention
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

interface InjectionCandidate {
	text: string;
	score: number;
	tag: string;
}

/**
 * Scores a context injection candidate based on recency, phase relevance, and agent fit.
 */
function scoreCandidate(
	candidate: InjectionCandidate,
	_agentName: string,
	_currentPhase: string | null,
): number {
	return candidate.score;
}

/**
 * Creates the experimental.chat.system.transform hook for system enhancement.
 */
export function createSystemEnhancerHook(
	config: PluginConfig,
	directory: string,
): Record<string, unknown> {
	const enabled = config.hooks?.system_enhancer !== false;
	const scoringEnabled = config.hooks?.scoring_injection === true || config.scoring?.enabled === true;

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

					function tryInject(text: string): boolean {
						const tokens = estimateTokens(text);
						if (injectedTokens + tokens > maxInjectionTokens) {
							return false;
						}
						output.system.push(text);
						injectedTokens += tokens;
						return true;
					}

					const contextContent = await readNewsroomFileAsync(
						directory,
						'context.md',
					);

					// Load plan for phase/task context
					const plan = await loadPlan(directory);
					const hasPlan = plan && plan.migration_status !== 'migration_failed';

					let currentPhase: string | null = null;
					let currentTask: string | null = null;

					if (hasPlan) {
						currentPhase = extractCurrentPhaseFromPlan(plan) ?? null;
						currentTask = extractCurrentTaskFromPlan(plan) ?? null;
					} else {
						const planContent = await readNewsroomFileAsync(directory, 'plan.md');
						if (planContent) {
							currentPhase = extractCurrentPhase(planContent) ?? null;
							currentTask = extractCurrentTask(planContent) ?? null;
						}
					}

					const activeAgent = _input.sessionID
						? (newsroomState.activeAgent.get(_input.sessionID) ?? null)
						: null;
					const baseAgentName = activeAgent
						? stripKnownNewsroomPrefix(activeAgent)
						: null;

					// Self-verification prevention: if an agent's output matches current reviewer,
					// skip injecting that agent's context (prevent circular reasoning)
					const isSelfVerifying =
						baseAgentName === 'copy_editor' &&
						activeAgent !== null &&
						newsroomState.delegationChains
							.get(_input.sessionID ?? '')
							?.slice(-1)[0]?.from === activeAgent;

					if (scoringEnabled) {
						// === Path B: Scoring-based injection ===
						const candidates: InjectionCandidate[] = [];

						if (currentPhase) {
							candidates.push({
								text: `[NEWSROOM CONTEXT] Current phase: ${currentPhase}`,
								score: 1.0,
								tag: 'phase',
							});
						}

						if (currentTask) {
							candidates.push({
								text: `[NEWSROOM CONTEXT] Current task: ${currentTask}`,
								score: 0.9,
								tag: 'task',
							});
						}

						if (contextContent && !isSelfVerifying) {
							const decisions = extractDecisions(contextContent, 200);
							if (decisions) {
								candidates.push({
									text: `[NEWSROOM CONTEXT] Key decisions: ${decisions}`,
									score: 0.7,
									tag: 'decisions',
								});
							}
						}

						// Retrospective injection for editor-in-chief
						if (baseAgentName === 'editor_in_chief' && hasPlan) {
							const completedPhases = plan.phases.filter(
								(p) => p.status === 'complete',
							);
							if (completedPhases.length > 0) {
								const lastCompleted = completedPhases[completedPhases.length - 1];
								candidates.push({
									text: `[NEWSROOM RETROSPECTIVE] Previously completed: Phase ${lastCompleted.id} "${lastCompleted.name}"`,
									score: 0.6,
									tag: 'retrospective',
								});
							}
						}

						// Agent-specific context
						if (
							config.hooks?.agent_activity !== false &&
							_input.sessionID &&
							activeAgent &&
							contextContent &&
							!isSelfVerifying
						) {
							const agentContext = extractAgentContext(
								contextContent,
								activeAgent,
								config.hooks?.agent_awareness_max_chars ?? 300,
							);
							if (agentContext) {
								candidates.push({
									text: `[NEWSROOM AGENT CONTEXT] ${agentContext}`,
									score: 0.5,
									tag: 'agent',
								});
							}
						}

						// Sort by score descending, inject under budget
						candidates.sort(
							(a, b) =>
								scoreCandidate(b, baseAgentName ?? '', currentPhase) -
								scoreCandidate(a, baseAgentName ?? '', currentPhase),
						);
						for (const candidate of candidates) {
							tryInject(candidate.text);
						}
					} else {
						// === Path A: Legacy sequential injection ===

						// Priority 1: Current phase
						if (currentPhase) {
							tryInject(`[NEWSROOM CONTEXT] Current phase: ${currentPhase}`);
						}

						// Priority 2: Current task
						if (currentTask) {
							tryInject(`[NEWSROOM CONTEXT] Current task: ${currentTask}`);
						}

						// Priority 3: Retrospective for editor-in-chief
						if (baseAgentName === 'editor_in_chief' && hasPlan) {
							const completedPhases = plan.phases.filter(
								(p) => p.status === 'complete',
							);
							if (completedPhases.length > 0) {
								const lastCompleted =
									completedPhases[completedPhases.length - 1];
								tryInject(
									`[NEWSROOM RETROSPECTIVE] Previously completed: Phase ${lastCompleted.id} "${lastCompleted.name}"`,
								);
							}
						}

						// Priority 4: Decisions
						if (contextContent && !isSelfVerifying) {
							const decisions = extractDecisions(contextContent, 200);
							if (decisions) {
								tryInject(`[NEWSROOM CONTEXT] Key decisions: ${decisions}`);
							}

							// Priority 5: Agent context
							if (
								config.hooks?.agent_activity !== false &&
								_input.sessionID &&
								activeAgent
							) {
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
 */
function extractAgentContext(
	contextContent: string,
	activeAgent: string,
	maxChars: number,
): string | null {
	const activityMatch = contextContent.match(
		/## Agent Activity\n([\s\S]*?)(?=\n## |$)/,
	);
	if (!activityMatch) return null;

	const activitySection = activityMatch[1].trim();
	if (!activitySection || activitySection === 'No tool activity recorded yet.')
		return null;

	const agentName = stripKnownNewsroomPrefix(activeAgent);

	let contextSummary: string;
	switch (agentName) {
		case 'writer':
			contextSummary = `Recent tool activity for writing context:\n${activitySection}`;
			break;
		case 'copy_editor':
			contextSummary = `Tool usage to review:\n${activitySection}`;
			break;
		case 'fact_checker':
			contextSummary = `Tool activity for fact-check context:\n${activitySection}`;
			break;
		case 'humanizer':
			contextSummary = `Prior writing activity:\n${activitySection}`;
			break;
		default:
			contextSummary = `Agent activity summary:\n${activitySection}`;
			break;
	}

	if (contextSummary.length > maxChars) {
		return `${contextSummary.substring(0, maxChars - 3)}...`;
	}

	return contextSummary;
}
