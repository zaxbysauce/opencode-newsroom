/**
 * Context Budget Tracker Hook
 *
 * Estimates token usage across all messages and injects budget warnings
 * when thresholds are exceeded. Uses experimental.chat.messages.transform
 * to provide proactive context management guidance to the editor-in-chief agent.
 */

import type { PluginConfig } from '../config';
import { estimateTokens } from './utils';

interface MessageInfo {
	role: string;
	agent?: string;
	sessionID?: string;
}

interface MessagePart {
	type: string;
	text?: string;
	[key: string]: unknown;
}

interface MessageWithParts {
	info: MessageInfo;
	parts: MessagePart[];
}

/**
 * Creates the experimental.chat.messages.transform hook for context budget tracking.
 * Injects warnings when context usage exceeds configured thresholds.
 * Only operates on messages for the editor_in_chief agent.
 */
export function createContextBudgetHandler(config: PluginConfig) {
	const enabled = config.context_budget?.enabled !== false;

	if (!enabled) {
		return async (
			_input: Record<string, never>,
			_output: { messages?: MessageWithParts[] },
		) => {
			// No-op function when context budget tracking is disabled
		};
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

		// Calculate total token usage across all text parts
		let totalTokens = 0;
		for (const message of messages) {
			if (!message?.parts) continue;

			for (const part of message.parts) {
				if (part?.type === 'text' && part.text) {
					totalTokens += estimateTokens(part.text);
				}
			}
		}

		const usagePercent = totalTokens / modelLimit;

		// Find the last user message
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

		// Only inject for editor_in_chief agent
		const agent = lastUserMessage.info?.agent;
		if (agent && agent !== 'editor_in_chief') return;

		// Find the first text part
		const textPartIndex = lastUserMessage.parts.findIndex(
			(p) => p?.type === 'text' && p.text !== undefined,
		);

		if (textPartIndex === -1) return;

		const pct = Math.round(usagePercent * 100);
		let warningText = '';

		if (usagePercent > criticalThreshold) {
			warningText = `[CONTEXT CRITICAL: ~${pct}% of context budget used. Offload details to .newsroom/context.md immediately]\n\n`;
		} else if (usagePercent > warnThreshold) {
			warningText = `[CONTEXT WARNING: ~${pct}% of context budget used. Consider summarizing to .newsroom/context.md]\n\n`;
		}

		if (warningText) {
			// Prepend the warning to the existing text
			const originalText = lastUserMessage.parts[textPartIndex].text ?? '';
			lastUserMessage.parts[textPartIndex].text =
				`${warningText}${originalText}`;
		}
	};
}
