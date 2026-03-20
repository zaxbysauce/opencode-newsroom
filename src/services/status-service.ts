/**
 * Status Service
 *
 * Extracted from commands/status.ts to allow reuse from multiple entry points
 * (commands, background processes, API calls).
 * Returns structured StatusData and formatted markdown.
 */

import type { AgentDefinition } from '../agents';
import {
	extractCurrentPhase,
	extractCurrentPhaseFromPlan,
} from '../hooks/extractors';
import { readNewsroomFileAsync } from '../hooks/utils';
import { loadPlan } from '../plan/manager';

export interface StatusData {
	currentPhase: string;
	completedTasks: number;
	totalTasks: number;
	blockedTasks: number;
	inProgressTasks: number;
	agentCount: number;
	planTitle?: string;
	newsroom?: string;
	contextUsagePct?: number;
}

/**
 * Gathers structured status data from the plan and agent registry.
 */
export async function getStatusData(
	directory: string,
	agents: Record<string, AgentDefinition>,
): Promise<StatusData> {
	const agentCount = Object.keys(agents).length;

	// Try structured plan first
	const plan = await loadPlan(directory);

	if (plan && plan.migration_status !== 'migration_failed') {
		const currentPhase = extractCurrentPhaseFromPlan(plan) || 'Unknown';

		let completedTasks = 0;
		let totalTasks = 0;
		let blockedTasks = 0;
		let inProgressTasks = 0;

		for (const phase of plan.phases) {
			for (const task of phase.tasks) {
				totalTasks++;
				if (task.status === 'completed') completedTasks++;
				else if (task.status === 'blocked') blockedTasks++;
				else if (task.status === 'in_progress') inProgressTasks++;
			}
		}

		return {
			currentPhase,
			completedTasks,
			totalTasks,
			blockedTasks,
			inProgressTasks,
			agentCount,
			planTitle: plan.title,
			newsroom: plan.swarm,
		};
	}

	// Legacy markdown fallback
	const planContent = await readNewsroomFileAsync(directory, 'plan.md');
	if (!planContent) {
		return {
			currentPhase: 'No plan',
			completedTasks: 0,
			totalTasks: 0,
			blockedTasks: 0,
			inProgressTasks: 0,
			agentCount,
		};
	}

	const currentPhase = extractCurrentPhase(planContent) || 'Unknown';
	const completedTasks = (planContent.match(/^- \[x\]/gm) || []).length;
	const incompleteTasks = (planContent.match(/^- \[ \]/gm) || []).length;
	const totalTasks = completedTasks + incompleteTasks;

	return {
		currentPhase,
		completedTasks,
		totalTasks,
		blockedTasks: 0,
		inProgressTasks: 0,
		agentCount,
	};
}

/**
 * Formats StatusData as a markdown report.
 */
export function formatStatusMarkdown(data: StatusData): string {
	const lines = ['## Newsroom Status', ''];

	if (data.planTitle) {
		lines.push(`**Plan**: ${data.planTitle}`);
	}
	if (data.newsroom) {
		lines.push(`**Newsroom**: ${data.newsroom}`);
	}

	lines.push(`**Current Phase**: ${data.currentPhase}`);

	const taskSummary = `${data.completedTasks}/${data.totalTasks} complete`;
	const extras: string[] = [];
	if (data.inProgressTasks > 0) extras.push(`${data.inProgressTasks} in progress`);
	if (data.blockedTasks > 0) extras.push(`${data.blockedTasks} blocked`);

	lines.push(
		`**Tasks**: ${taskSummary}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`,
	);
	lines.push(`**Agents**: ${data.agentCount} registered`);

	if (data.contextUsagePct !== undefined) {
		lines.push(`**Context**: ~${data.contextUsagePct}% used`);
	}

	return lines.join('\n');
}

/**
 * Full command handler — gathers data and formats markdown.
 */
export async function handleStatusCommand(
	directory: string,
	agents: Record<string, AgentDefinition>,
): Promise<string> {
	const data = await getStatusData(directory, agents);
	return formatStatusMarkdown(data);
}
