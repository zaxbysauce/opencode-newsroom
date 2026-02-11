import * as path from 'node:path';
import {
	type Phase,
	type Plan,
	PlanSchema,
	type Task,
	type TaskStatus,
} from '../config/plan-schema';
import { readNewsroomFileAsync } from '../hooks/utils';
import { warn } from '../utils';

/**
 * Loads plan.json only (no markdown fallback)
 * @param directory The directory containing .newsroom/
 * @returns The validated plan or null if not found
 */
export async function loadPlanJsonOnly(
	directory: string,
): Promise<Plan | null> {
	const planJsonContent = await readNewsroomFileAsync(directory, 'plan.json');
	if (planJsonContent !== null) {
		try {
			const parsed = JSON.parse(planJsonContent);
			const validated = PlanSchema.parse(parsed);
			return validated;
		} catch (error) {
			warn(
				`Plan validation failed for .newsroom/plan.json: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return null;
}

/**
 * Loads plan from .newsroom/plan.json (with markdown fallback)
 * @param directory The directory containing .newsroom/
 * @returns The validated plan or null if not found
 */
export async function loadPlan(directory: string): Promise<Plan | null> {
	const planJsonContent = await readNewsroomFileAsync(directory, 'plan.json');
	if (planJsonContent !== null) {
		try {
			const parsed = JSON.parse(planJsonContent);
			const validated = PlanSchema.parse(parsed);
			return validated;
		} catch (error) {
			warn(
				`Plan validation failed for .newsroom/plan.json: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	const planMdContent = await readNewsroomFileAsync(directory, 'plan.md');
	if (planMdContent !== null) {
		const migrated = migrateLegacyPlan(planMdContent);
		await savePlan(directory, migrated);
		return migrated;
	}
	return null;
}

/**
 * Saves plan to .newsroom/plan.json and .newsroom/plan.md
 * @param directory The directory containing .newsroom/
 * @param plan The plan to save
 */
export async function savePlan(directory: string, plan: Plan): Promise<void> {
	const validated = PlanSchema.parse(plan);
	const newsroomDir = path.resolve(directory, '.newsroom');
	const planPath = path.join(newsroomDir, 'plan.json');
	const tempPath = path.join(newsroomDir, `plan.json.tmp.${Date.now()}`);
	await Bun.write(tempPath, JSON.stringify(validated, null, 2));
	const { renameSync } = await import('node:fs');
	renameSync(tempPath, planPath);
	const markdown = derivePlanMarkdown(validated);
	await Bun.write(path.join(newsroomDir, 'plan.md'), markdown);
}

/**
 * Updates the status of a task in the plan
 * @param directory The directory containing .newsroom/
 * @param taskId The ID of the task to update
 * @param status The new status
 * @returns The updated plan
 */
export async function updateTaskStatus(
	directory: string,
	taskId: string,
	status: TaskStatus,
): Promise<Plan> {
	const plan = await loadPlan(directory);
	if (plan === null) {
		throw new Error(`Plan not found in directory: ${directory}`);
	}
	let taskFound = false;
	const updatedPhases: Phase[] = plan.phases.map((phase) => {
		const updatedTasks: Task[] = phase.tasks.map((task) => {
			if (task.id === taskId) {
				taskFound = true;
				return { ...task, status };
			}
			return task;
		});
		return { ...phase, tasks: updatedTasks };
	});
	if (!taskFound) {
		throw new Error(`Task not found: ${taskId}`);
	}
	const updatedPlan: Plan = { ...plan, phases: updatedPhases };
	await savePlan(directory, updatedPlan);
	return updatedPlan;
}

/**
 * Derives markdown representation of the plan
 * @param plan The plan to convert to markdown
 * @returns Markdown string
 */
export function derivePlanMarkdown(plan: Plan): string {
	const statusMap: Record<string, string> = {
		pending: 'PENDING',
		in_progress: 'IN PROGRESS',
		complete: 'COMPLETE',
		blocked: 'BLOCKED',
	};
	const now = new Date().toISOString();
	const phaseStatus =
		statusMap[plan.phases[plan.current_phase - 1]?.status] || 'PENDING';
	let markdown = `# ${plan.title}\nNewsroom: ${plan.swarm}\nPhase: ${plan.current_phase} [${phaseStatus}] | Updated: ${now}\n`;
	for (const phase of plan.phases) {
		const phaseStatusText = statusMap[phase.status] || 'PENDING';
		markdown += `\n## Phase ${phase.id}: ${phase.name} [${phaseStatusText}]\n`;
		let currentTaskMarked = false;
		for (const task of phase.tasks) {
			let taskLine = '';
			let suffix = '';
			if (task.status === 'completed') {
				taskLine = `- [x] ${task.id}: ${task.description}`;
			} else if (task.status === 'blocked') {
				taskLine = `- [BLOCKED] ${task.id}: ${task.description}`;
				if (task.blocked_reason) {
					taskLine += ` - ${task.blocked_reason}`;
				}
			} else {
				taskLine = `- [ ] ${task.id}: ${task.description}`;
			}
			taskLine += ` [${task.size.toUpperCase()}]`;
			if (task.depends.length > 0) {
				suffix += ` (depends: ${task.depends.join(', ')})`;
			}
			if (
				phase.id === plan.current_phase &&
				task.status === 'in_progress' &&
				!currentTaskMarked
			) {
				suffix += ' ← CURRENT';
				currentTaskMarked = true;
			}
			markdown += `${taskLine}${suffix}\n`;
		}
	}
	const phaseSections = markdown.split('\n## ');
	if (phaseSections.length > 1) {
		const header = phaseSections[0];
		const phases = phaseSections.slice(1).map((p) => `## ${p}`);
		markdown = `${header}\n---\n${phases.join('\n---\n')}`;
	}
	return `${markdown.trim()}\n`;
}

/**
 * Migrates legacy markdown plan format to plan.json
 * @param planContent The markdown content to migrate
 * @param newsroomId The newsroom ID (optional, for backward compatibility)
 * @returns The migrated plan
 */
export function migrateLegacyPlan(
	planContent: string,
	newsroomId?: string,
): Plan {
	const lines = planContent.split('\n');
	let title = 'Untitled Plan';
	let newsroom = newsroomId || 'default-newsroom';
	let currentPhaseNum = 1;
	const phases: Phase[] = [];
	let currentPhase: Phase | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('# ') && title === 'Untitled Plan') {
			title = trimmed.substring(2).trim();
			continue;
		}
		if (trimmed.startsWith('Swarm:') || trimmed.startsWith('Newsroom:')) {
			const prefix = trimmed.startsWith('Newsroom:') ? 'Newsroom:' : 'Swarm:';
			newsroom = trimmed.substring(prefix.length).trim();
			continue;
		}
		if (trimmed.startsWith('Phase:')) {
			const match = trimmed.match(/Phase:\s*(\d+)/i);
			if (match) {
				currentPhaseNum = parseInt(match[1], 10);
			}
			continue;
		}
		const phaseMatch = trimmed.match(
			/^##\s*Phase\s+(\d+)(?::\s*([^[]+))?\s*(?:\[([^\]]+)\])?/i,
		);
		if (phaseMatch) {
			if (currentPhase !== null) {
				phases.push(currentPhase);
			}
			const phaseId = parseInt(phaseMatch[1], 10);
			const phaseName = phaseMatch[2]?.trim() || `Phase ${phaseId}`;
			const statusText = phaseMatch[3]?.toLowerCase() || 'pending';
			const statusMap: Record<string, Phase['status']> = {
				complete: 'complete',
				completed: 'complete',
				'in progress': 'in_progress',
				in_progress: 'in_progress',
				inprogress: 'in_progress',
				pending: 'pending',
				blocked: 'blocked',
			};
			currentPhase = {
				id: phaseId,
				name: phaseName,
				status: statusMap[statusText] || 'pending',
				tasks: [],
			};
			continue;
		}
		const taskMatch = trimmed.match(
			/^-\s*\[([^\]]+)\]\s+(\d+\.\d+):\s*(.+?)(?:\s*\[(\w+)\])?(?:\s*-\s*(.+))?$/i,
		);
		if (taskMatch && currentPhase !== null) {
			const checkbox = taskMatch[1].toLowerCase();
			const taskId = taskMatch[2];
			let description = taskMatch[3].trim();
			const sizeText = taskMatch[4]?.toLowerCase() || 'small';
			let blockedReason: string | undefined;
			const dependsMatch = description.match(/\s*\(depends:\s*([^)]+)\)$/i);
			const depends: string[] = [];
			if (dependsMatch) {
				const depsText = dependsMatch[1];
				depends.push(...depsText.split(',').map((d) => d.trim()));
				description = description.substring(0, dependsMatch.index).trim();
			}
			let status: Task['status'] = 'pending';
			if (checkbox === 'x') {
				status = 'completed';
			} else if (checkbox === 'blocked') {
				status = 'blocked';
				const blockedReasonMatch = taskMatch[5];
				if (blockedReasonMatch) {
					blockedReason = blockedReasonMatch.trim();
				}
			}
			const sizeMap: Record<string, Task['size']> = {
				small: 'small',
				medium: 'medium',
				large: 'large',
			};
			const task: Task = {
				id: taskId,
				phase: currentPhase.id,
				status,
				size: sizeMap[sizeText] || 'small',
				description,
				depends,
				acceptance: undefined,
				files_touched: [],
				evidence_path: undefined,
				blocked_reason: blockedReason,
			};
			currentPhase.tasks.push(task);
		}
	}
	if (currentPhase !== null) {
		phases.push(currentPhase);
	}
	let migrationStatus: Plan['migration_status'] = 'migrated';
	if (phases.length === 0) {
		migrationStatus = 'migration_failed';
		phases.push({
			id: 1,
			name: 'Migration Failed',
			status: 'blocked',
			tasks: [
				{
					id: '1.1',
					phase: 1,
					status: 'blocked',
					size: 'large',
					description: 'Review and restructure plan manually',
					depends: [],
					files_touched: [],
					blocked_reason: 'Legacy plan could not be parsed automatically',
				},
			],
		});
	}
	phases.sort((a, b) => a.id - b.id);
	const plan: Plan = {
		schema_version: '1.0.0',
		title,
		swarm: newsroom,
		current_phase: currentPhaseNum,
		phases,
		migration_status: migrationStatus,
	};
	return plan;
}
