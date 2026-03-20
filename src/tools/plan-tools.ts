/**
 * Plan Management Tools
 *
 * Tools for agents to interact with the editorial plan:
 * - save_plan: persist a plan structure
 * - phase_complete: mark the current phase complete + trigger retrospective gate
 * - update_task_status: update a task's status in the plan
 *
 * Adapted from opencode-swarm plan tools for editorial workflow.
 */

import { mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import { loadPlan, savePlan, updateTaskStatus } from '../plan/manager';

/**
 * save_plan — Persists the current plan to .newsroom/plan.json and plan.md.
 * Used by editor-in-chief to checkpoint plan state after updates.
 */
export function createSavePlanTool(directory: string): ToolDefinition {
	return tool({
		description:
			'Save the current editorial plan to .newsroom/plan.json. ' +
			'Call this after updating any task statuses or phase information to checkpoint your progress. ' +
			'The plan is also written to .newsroom/plan.md for human readability.',
		args: {
			notes: tool.schema
				.string()
				.optional()
				.describe('Optional notes about what changed in this save'),
		},
		execute: async (args) => {
			try {
				const plan = await loadPlan(directory);
				if (!plan) {
					return 'No plan found in .newsroom/plan.json. Create a plan first before saving.';
				}
				await savePlan(directory, plan);
				const notes = args.notes ? ` Notes: ${args.notes}` : '';
				return `Plan saved successfully to .newsroom/plan.json and .newsroom/plan.md.${notes}`;
			} catch (error) {
				return `Failed to save plan: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}

/**
 * phase_complete — Mark the current phase complete.
 * Triggers retrospective gate: requires lessons_learned before advancing.
 */
export function createPhaseCompleteTool(directory: string): ToolDefinition {
	return tool({
		description:
			'Mark the current editorial phase as complete. ' +
			'Requires providing lessons_learned about what worked, what did not work, ' +
			'and any editorial patterns discovered. ' +
			'This triggers the retrospective gate — phases cannot be marked complete without documentation. ' +
			'The lessons are saved to .newsroom/context.md.',
		args: {
			phase_id: tool.schema
				.number()
				.describe('The phase number to mark as complete (e.g. 1, 2, 3)'),
			lessons_learned: tool.schema
				.string()
				.describe(
					'Required: What was learned in this phase. What worked? What failed? ' +
						'Any editorial style patterns or source reliability notes. Min 50 chars.',
				),
			summary: tool.schema
				.string()
				.optional()
				.describe('Brief summary of what was accomplished in this phase'),
		},
		execute: async (args) => {
			if (!args.lessons_learned || args.lessons_learned.trim().length < 50) {
				return `❌ RETROSPECTIVE GATE: Cannot mark phase ${args.phase_id} complete. ` +
					'lessons_learned is required and must be at least 50 characters. ' +
					'Document what worked, what failed, and any patterns discovered.';
			}

			try {
				const plan = await loadPlan(directory);
				if (!plan) {
					return 'No plan found. Cannot mark phase complete.';
				}

				const phase = plan.phases.find((p) => p.id === args.phase_id);
				if (!phase) {
					return `Phase ${args.phase_id} not found in plan.`;
				}

				// Mark phase as complete
				phase.status = 'complete';
				// Mark all tasks in phase as completed if they aren't already
				for (const task of phase.tasks) {
					if (task.status === 'in_progress' || task.status === 'pending') {
						task.status = 'completed';
					}
				}

				// Advance current_phase to the next incomplete phase
				if (plan.current_phase === args.phase_id) {
					const nextPhase = plan.phases.find(
						(p) => p.id === args.phase_id + 1,
					);
					if (nextPhase) {
						plan.current_phase = nextPhase.id;
					}
					// If no next phase exists, current_phase remains at the last completed phase
					// — this is intentional; the plan is done and phase.status === 'complete' signals completion
				}

				await savePlan(directory, plan);

				// Append lessons to context.md
				const newsroomDir = path.resolve(directory, '.newsroom');
				mkdirSync(newsroomDir, { recursive: true });

				const contextPath = path.join(newsroomDir, 'context.md');
				const timestamp = new Date().toISOString().split('T')[0];
				const lessonsEntry =
					`\n\n## Phase ${args.phase_id} Retrospective (${timestamp})\n` +
					`${args.lessons_learned.trim()}\n`;

				try {
					const existing = await Bun.file(contextPath).text();
					await Bun.write(contextPath, existing + lessonsEntry);
				} catch {
					await Bun.write(contextPath, `# Newsroom Context\n${lessonsEntry}`);
				}

				const isLastPhase = !plan.phases.find((p) => p.id === args.phase_id + 1);
				const completionNote = isLastPhase
					? ' All phases complete — editorial pipeline finished.'
					: '';
				const summaryText = args.summary ? `\n\nSummary: ${args.summary}` : '';
				return `✅ Phase ${args.phase_id} marked complete. Lessons saved to .newsroom/context.md.${completionNote}${summaryText}`;
			} catch (error) {
				return `Failed to complete phase: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}

/**
 * update_task_status — Update the status of a specific task in the plan.
 */
export function createUpdateTaskStatusTool(directory: string): ToolDefinition {
	return tool({
		description:
			'Update the status of a specific task in the editorial plan. ' +
			'Valid statuses: pending, in_progress, completed, blocked. ' +
			'Use this to track progress as the pipeline advances.',
		args: {
			task_id: tool.schema
				.string()
				.describe('The task ID to update (e.g. "1.1", "2.3")'),
			status: tool.schema
				.enum(['pending', 'in_progress', 'completed', 'blocked'])
				.describe('The new status for the task'),
			blocked_reason: tool.schema
				.string()
				.optional()
				.describe('Required when status is "blocked": reason the task is blocked'),
		},
		execute: async (args) => {
			if (args.status === 'blocked' && !args.blocked_reason) {
				return '❌ blocked_reason is required when setting status to "blocked".';
			}

			try {
				await updateTaskStatus(directory, args.task_id, args.status);
				const blockedNote =
					args.blocked_reason ? ` Reason: ${args.blocked_reason}` : '';
				return `✅ Task ${args.task_id} status updated to "${args.status}".${blockedNote}`;
			} catch (error) {
				return `Failed to update task status: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}
