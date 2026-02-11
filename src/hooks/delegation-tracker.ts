/**
 * Delegation Tracker Hook
 *
 * Tracks agent delegation by monitoring chat.message events with agent fields.
 * Updates the active agent map and optionally logs delegation chain entries.
 */

import type { PluginConfig } from '../config/schema';
import type { DelegationEntry } from '../state';
import { newsroomState } from '../state';

/**
 * Creates the chat.message hook for delegation tracking.
 */
export function createDelegationTrackerHook(
	config: PluginConfig,
): (
	input: { sessionID: string; agent?: string },
	output: Record<string, unknown>,
) => Promise<void> {
	return async (
		input: { sessionID: string; agent?: string },
		_output: Record<string, unknown>,
	): Promise<void> => {
		// If no agent is specified, return immediately
		if (!input.agent || input.agent === '') {
			return;
		}

		// Get the previous agent for this session
		const previousAgent = newsroomState.activeAgent.get(input.sessionID);

		// Update the active agent
		newsroomState.activeAgent.set(input.sessionID, input.agent);

		// If delegation tracking is enabled and agent has changed, log the delegation
		if (
			config.hooks?.delegation_tracker === true &&
			previousAgent &&
			previousAgent !== input.agent
		) {
			// Create a delegation entry
			const entry: DelegationEntry = {
				from: previousAgent,
				to: input.agent,
				timestamp: Date.now(),
			};

			// Get or create the delegation chain for this session
			if (!newsroomState.delegationChains.has(input.sessionID)) {
				newsroomState.delegationChains.set(input.sessionID, []);
			}

			// Push the entry to the chain
			const chain = newsroomState.delegationChains.get(input.sessionID);
			chain?.push(entry);

			// Increment pending events counter
			newsroomState.pendingEvents++;
		}
	};
}
