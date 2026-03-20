import { describe, expect, test } from 'bun:test';
import {
	type StatusData,
	formatStatusMarkdown,
	getStatusData,
} from '../../../src/services/status-service';

describe('formatStatusMarkdown', () => {
	test('includes required fields', () => {
		const data: StatusData = {
			currentPhase: 'Research',
			completedTasks: 3,
			totalTasks: 10,
			blockedTasks: 1,
			inProgressTasks: 2,
			agentCount: 8,
		};
		const result = formatStatusMarkdown(data);
		expect(result).toContain('## Newsroom Status');
		expect(result).toContain('Current Phase');
		expect(result).toContain('Research');
		expect(result).toContain('3/10');
		expect(result).toContain('8 registered');
	});

	test('includes plan title when provided', () => {
		const data: StatusData = {
			currentPhase: 'Writing',
			completedTasks: 0,
			totalTasks: 5,
			blockedTasks: 0,
			inProgressTasks: 0,
			agentCount: 4,
			planTitle: 'Climate Crisis Investigation',
		};
		const result = formatStatusMarkdown(data);
		expect(result).toContain('Climate Crisis Investigation');
	});

	test('includes in-progress and blocked counts', () => {
		const data: StatusData = {
			currentPhase: 'QA Review',
			completedTasks: 5,
			totalTasks: 10,
			blockedTasks: 2,
			inProgressTasks: 1,
			agentCount: 6,
		};
		const result = formatStatusMarkdown(data);
		expect(result).toContain('1 in progress');
		expect(result).toContain('2 blocked');
	});

	test('omits extras line when no in-progress or blocked', () => {
		const data: StatusData = {
			currentPhase: 'Complete',
			completedTasks: 10,
			totalTasks: 10,
			blockedTasks: 0,
			inProgressTasks: 0,
			agentCount: 8,
		};
		const result = formatStatusMarkdown(data);
		expect(result).not.toContain('in progress');
		expect(result).not.toContain('blocked');
	});

	test('includes context usage when provided', () => {
		const data: StatusData = {
			currentPhase: 'Writing',
			completedTasks: 2,
			totalTasks: 5,
			blockedTasks: 0,
			inProgressTasks: 1,
			agentCount: 8,
			contextUsagePct: 72,
		};
		const result = formatStatusMarkdown(data);
		expect(result).toContain('72%');
	});
});

describe('getStatusData — no plan', () => {
	test('returns fallback data when directory has no plan', async () => {
		// Use a temp dir with no .newsroom directory
		const data = await getStatusData('/nonexistent/dir/that/has/no/plan', {});
		expect(data.currentPhase).toBe('No plan');
		expect(data.completedTasks).toBe(0);
		expect(data.totalTasks).toBe(0);
		expect(data.agentCount).toBe(0);
	});

	test('counts agents correctly', async () => {
		const agents = {
			editor_in_chief: { name: 'editor_in_chief', description: '', config: { model: 'gpt-4', temperature: 0, prompt: '' } },
			writer: { name: 'writer', description: '', config: { model: 'gpt-4', temperature: 0, prompt: '' } },
		};
		const data = await getStatusData('/nonexistent/dir', agents);
		expect(data.agentCount).toBe(2);
	});
});
