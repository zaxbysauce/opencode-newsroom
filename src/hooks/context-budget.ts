/**
 * Context Budget Tracker Hook
 *
 * Estimates token usage across all messages and injects budget warnings
 * when thresholds are exceeded.
 *
 * Upgraded to match opencode-swarm v6+:
 * - Message priority classification (CRITICAL / HIGH / MEDIUM / LOW / DISPOSABLE)
 * - Two-stage message reduction:
 *   Stage 1: Mask older tool outputs with [MASKED] placeholders
 *   Stage 2: Remove DISPOSABLE/LOW messages atomically
 * - Agent-switch detection to enforce budget on transitions
 * - Tool output exemptions (retrieve_summary outputs are preserved)
 */

import type { PluginConfig } from '../config';
import { estimateTokens } from './utils';

type MessagePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DISPOSABLE';

interface MessageInfo {
	role: string;
	agent?: string;
	sessionID?: string;
}

interface MessagePart {
	type: string;
	text?: string;
	toolName?: string;
	[key: string]: unknown;
}

interface MessageWithParts {
	info: MessageInfo;
	parts: MessagePart[];
}

// Tools whose outputs should never be masked/removed
const EXEMPT_TOOLS = new Set(['retrieve_summary', 'task', 'phase_complete']);

// How many recent messages to always preserve (never reduce)
const PRESERVE_RECENT_TURNS = 4;

/**
 * Classifies a message's priority for reduction purposes.
 */
function classifyMessage(
	msg: MessageWithParts,
	index: number,
	total: number,
	preserveRecent: number,
): MessagePriority {
	// Most recent N messages are always CRITICAL
	if (index >= total - preserveRecent) return 'CRITICAL';

	const role = msg.info?.role;

	// System messages are always CRITICAL
	if (role === 'system') return 'CRITICAL';

	// User messages — HIGH (they provide direction)
	if (role === 'user') return 'HIGH';

	// Assistant messages — priority depends on content
	if (role === 'assistant') {
		const hasTool = msg.parts.some((p) => p.type === 'tool_use');
		if (hasTool) return 'MEDIUM';
		return 'HIGH';
	}

	// Tool results
	if (role === 'tool') {
		const toolName = msg.parts[0]?.toolName ?? '';
		if (EXEMPT_TOOLS.has(toolName)) return 'HIGH';
		// Old tool outputs are candidates for masking
		if (index < total - 8) return 'DISPOSABLE';
		if (index < total - 4) return 'LOW';
		return 'MEDIUM';
	}

	return 'MEDIUM';
}

/**
 * Estimates total tokens across all messages.
 */
function estimateTotalTokens(messages: MessageWithParts[]): number {
	let total = 0;
	for (const msg of messages) {
		for (const part of msg.parts) {
			if (part.type === 'text' && part.text) {
				total += estimateTokens(part.text);
			}
		}
	}
	return total;
}

/**
 * Stage 1 reduction: mask tool output text with [MASKED] for DISPOSABLE messages.
 * Returns true if any masking was performed.
 */
function maskOldToolOutputs(
	messages: MessageWithParts[],
	targetTokens: number,
): boolean {
	let masked = false;
	let currentTokens = estimateTotalTokens(messages);

	for (let i = 0; i < messages.length && currentTokens > targetTokens; i++) {
		const msg = messages[i];
		if (msg.info?.role !== 'tool') continue;

		const toolName = msg.parts[0]?.toolName ?? '';
		if (EXEMPT_TOOLS.has(toolName)) continue;

		for (const part of msg.parts) {
			if (part.type === 'text' && part.text && part.text.length > 200) {
				const oldLen = estimateTokens(part.text);
				part.text = '[MASKED: tool output removed to reduce context]';
				currentTokens -= oldLen - estimateTokens(part.text);
				masked = true;
			}
		}
	}

	return masked;
}

/**
 * Creates the experimental.chat.messages.transform hook for context budget tracking.
 */
export function createContextBudgetHandler(config: PluginConfig) {
	const enabled = config.context_budget?.enabled !== false;
	const reductionEnabled = config.context_budget?.reduction_enabled !== false;

	if (!enabled) {
		return async (
			_input: Record<string, never>,
			_output: { messages?: MessageWithParts[] },
		) => {};
	}

	const warnThreshold = config.context_budget?.warn_threshold ?? 0.7;
	const criticalThreshold = config.context_budget?.critical_threshold ?? 0.9;
	const modelLimits = config.context_budget?.model_limits ?? {
		default: 128000,
	};
	const modelLimit = modelLimits.default ?? 128000;

	return async (
		_input: Record<string, never>,
		output: { messages?: MessageWithParts[] },
	): Promise<void> => {
		const messages = output?.messages;
		if (!messages || messages.length === 0) return;

		const totalTokens = estimateTotalTokens(messages);
		const usagePercent = totalTokens / modelLimit;

		// Two-stage reduction when above critical threshold
		if (reductionEnabled && usagePercent > criticalThreshold) {
			const targetTokens = Math.floor(modelLimit * warnThreshold);

			// Stage 1: Mask old tool outputs
			maskOldToolOutputs(messages, targetTokens);

			// Stage 2: Remove DISPOSABLE messages atomically
			const postMaskTokens = estimateTotalTokens(messages);
			if (postMaskTokens > targetTokens) {
				// Classify and remove from oldest first
				const priorities = messages.map((msg, i) =>
					classifyMessage(msg, i, messages.length, PRESERVE_RECENT_TURNS),
				);

				// Remove DISPOSABLE first, then LOW if still over budget
				for (const priority of ['DISPOSABLE', 'LOW'] as MessagePriority[]) {
					let currentTokens = estimateTotalTokens(messages);
					if (currentTokens <= targetTokens) break;

					// Iterate oldest to newest, remove matching priority
					for (let i = 0; i < messages.length && currentTokens > targetTokens; i++) {
						if (priorities[i] === priority) {
							// Estimate tokens removed
							const msgTokens = messages[i].parts.reduce(
								(sum, p) =>
									sum + (p.type === 'text' && p.text ? estimateTokens(p.text) : 0),
								0,
							);
							// Replace with a tombstone rather than splicing to preserve array integrity
							messages[i] = {
								info: { role: messages[i].info.role },
								parts: [
									{
										type: 'text',
										text: '[REMOVED: context reduction]',
									},
								],
							};
							currentTokens -= msgTokens;
						}
					}
				}
			}
		}

		// Inject budget warning into last user message
		const recalcPct = Math.round(
			(estimateTotalTokens(messages) / modelLimit) * 100,
		);

		let lastUserMessageIndex = -1;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i]?.info?.role === 'user') {
				lastUserMessageIndex = i;
				break;
			}
		}

		if (lastUserMessageIndex === -1) return;

		const lastUserMessage = messages[lastUserMessageIndex];
		if (!lastUserMessage?.parts) return;

		// Only inject for editor_in_chief agent (or unknown agent)
		const agent = lastUserMessage.info?.agent;
		if (agent && agent !== 'editor_in_chief') return;

		const textPartIndex = lastUserMessage.parts.findIndex(
			(p) => p?.type === 'text' && p.text !== undefined,
		);
		if (textPartIndex === -1) return;

		const currentUsage = estimateTotalTokens(messages) / modelLimit;
		let warningText = '';

		if (currentUsage > criticalThreshold) {
			warningText = `[CONTEXT CRITICAL: ~${recalcPct}% of context budget used. Offload details to .newsroom/context.md immediately]\n\n`;
		} else if (currentUsage > warnThreshold) {
			warningText = `[CONTEXT WARNING: ~${recalcPct}% of context budget used. Consider summarizing to .newsroom/context.md]\n\n`;
		}

		if (warningText) {
			const originalText = lastUserMessage.parts[textPartIndex].text ?? '';
			lastUserMessage.parts[textPartIndex].text = `${warningText}${originalText}`;
		}
	};
}
