/**
 * Pipeline Tracker Hook
 *
 * Injects phase reminders into messages to keep the Editor-in-Chief on track.
 * Uses experimental.chat.messages.transform so it doesn't show in UI.
 *
 * Upgraded to match opencode-swarm v6+:
 * - Escalation-based compliance: intensifies warnings after N turns without delegation
 * - Mandatory QA delegation enforcement: warns if copy_editor/managing_editor skipped
 * - Stage skip prevention: blocks out-of-order phase execution
 * - Turn counter tracking per session
 *
 * Research: ~40% compliance drop after 2-3 turns without reminders.
 */

import type { PluginConfig } from '../config';
import { newsroomState } from '../state';
import { safeHook } from './utils';

// Base reminder injected every turn
const BASE_REMINDER = `<newsroom_reminder>
⚠️ EDITOR-IN-CHIEF WORKFLOW REMINDER:
1. ANALYZE → Identify domains, create initial brief
2. SME_CONSULTATION → Delegate to @sme (one domain per call, max 3 calls)
3. COLLATE → Synthesize SME outputs into unified brief
4. WRITE → Delegate to @writer
5. EDITORIAL_REVIEW → Delegate to @copy_editor (specify CHECK dimensions)
6. TRIAGE → Review feedback: APPROVED | REVISION_NEEDED | BLOCKED
7. FACT_CHECK → If approved, delegate to @fact_checker

DELEGATION RULES:
- SME: ONE domain per call (serial), max 3 per phase
- Copy Editor: Specify CHECK dimensions relevant to the change
- Always wait for response before next delegation
</newsroom_reminder>`;

// Escalated reminder after N turns without QA delegation
const ESCALATED_REMINDER = `<newsroom_reminder urgency="HIGH">
🚨 CRITICAL REMINDER — QA DELEGATION REQUIRED:
You MUST delegate to @copy_editor before marking any writing task complete.
Skipping editorial review is a protocol violation.

Current required steps:
5. EDITORIAL_REVIEW → Delegate to @copy_editor NOW
6. TRIAGE → Review their feedback
7. FACT_CHECK → Only after copy_editor APPROVED

Do NOT proceed to fact-check or publish without copy_editor approval.
</newsroom_reminder>`;

// Mandatory delegation reminder when QA appears skipped
const QA_MANDATORY_REMINDER = `<newsroom_reminder urgency="CRITICAL">
🛑 MANDATORY QA GATE: You have not delegated to @copy_editor or @managing_editor.
Editorial review is REQUIRED before any section can be marked complete.
Delegate to @copy_editor immediately using the task tool.
</newsroom_reminder>`;

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

// Per-session turn tracking for escalation
const sessionTurnsSinceQA = new Map<string, number>();
const sessionTotalTurns = new Map<string, number>();

// Turns without QA delegation before escalating (based on swarm research)
const ESCALATION_THRESHOLD = 3;
// Turns without QA delegation before mandatory enforcement
const MANDATORY_THRESHOLD = 6;

/**
 * Checks if the recent message history includes a QA delegation (copy_editor or managing_editor).
 */
function hasRecentQADelegation(messages: MessageWithParts[]): boolean {
	// Check last 4 messages for delegation to QA agents
	const recent = messages.slice(-4);
	for (const msg of recent) {
		for (const part of msg.parts) {
			if (
				part.type === 'text' &&
				part.text &&
				(part.text.includes('@copy_editor') ||
					part.text.includes('@managing_editor') ||
					part.text.includes('copy_editor') ||
					part.text.includes('managing_editor'))
			) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Creates the experimental.chat.messages.transform hook for pipeline tracking.
 * Only injects for the editor_in_chief agent.
 */
export function createPipelineTrackerHook(config: PluginConfig) {
	const enabled = config.inject_phase_reminders !== false;

	if (!enabled) {
		return {};
	}

	return {
		'experimental.chat.messages.transform': safeHook(
			async (
				_input: Record<string, never>,
				output: { messages?: MessageWithParts[] },
			): Promise<void> => {
				const messages = output?.messages;
				if (!messages || messages.length === 0) return;

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

				// Only inject for editor_in_chief (or if no agent specified = main session)
				const agent = lastUserMessage.info?.agent;
				if (agent && agent !== 'editor_in_chief') return;

				const sessionId = lastUserMessage.info?.sessionID ?? 'default';

				// Update turn counters
				const totalTurns = (sessionTotalTurns.get(sessionId) ?? 0) + 1;
				sessionTotalTurns.set(sessionId, totalTurns);

				// Check if QA has been delegated recently
				const hasQA = hasRecentQADelegation(messages);
				if (hasQA) {
					// Reset escalation counter when QA is seen
					sessionTurnsSinceQA.set(sessionId, 0);
				} else {
					const turnsSinceQA = (sessionTurnsSinceQA.get(sessionId) ?? 0) + 1;
					sessionTurnsSinceQA.set(sessionId, turnsSinceQA);
				}

				const turnsSinceQA = sessionTurnsSinceQA.get(sessionId) ?? 0;

				// Check workflow state to determine if QA should have happened
				const session = newsroomState.agentSessions.get(sessionId);
				const isInWritePhase =
					session?.taskWorkflow === 'writer_delegated' ||
					session?.taskWorkflow === 'copy_edit_run';

				// Find the first text part to prepend reminder
				const textPartIndex = lastUserMessage.parts.findIndex(
					(p) => p?.type === 'text' && p.text !== undefined,
				);
				if (textPartIndex === -1) return;

				const originalText = lastUserMessage.parts[textPartIndex].text ?? '';

				// Select appropriate reminder level
				let reminder: string;
				if (
					isInWritePhase &&
					!hasQA &&
					turnsSinceQA >= MANDATORY_THRESHOLD
				) {
					// Mandatory enforcement
					reminder = QA_MANDATORY_REMINDER;
					if (session) session.qaSkipped = true;
				} else if (
					isInWritePhase &&
					!hasQA &&
					turnsSinceQA >= ESCALATION_THRESHOLD
				) {
					// Escalated warning
					reminder = ESCALATED_REMINDER;
				} else {
					// Standard reminder
					reminder = BASE_REMINDER;
				}

				lastUserMessage.parts[textPartIndex].text =
					`${reminder}\n\n---\n\n${originalText}`;
			},
		),
	};
}
