import { beforeEach, describe, expect, test } from 'bun:test';
import {
	advanceTaskState,
	beginInvocation,
	getAgentSession,
	logGateResult,
	markQASkipped,
	resetNewsroomState,
	startAgentSession,
} from '../../../src/state';

describe('advanceTaskState', () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test('advances one step at a time', () => {
		startAgentSession('s1', 'editor_in_chief');
		expect(advanceTaskState('s1', 'writer_delegated')).toBe(true);
		expect(getAgentSession('s1')!.taskWorkflow).toBe('writer_delegated');
	});

	test('advances through full pipeline in order', () => {
		startAgentSession('s1', 'editor_in_chief');
		expect(advanceTaskState('s1', 'writer_delegated')).toBe(true);
		expect(advanceTaskState('s1', 'copy_edit_run')).toBe(true);
		expect(advanceTaskState('s1', 'fact_check_run')).toBe(true);
		expect(advanceTaskState('s1', 'humanizer_run')).toBe(true);
		expect(advanceTaskState('s1', 'complete')).toBe(true);
		expect(getAgentSession('s1')!.taskWorkflow).toBe('complete');
	});

	test('rejects skipping states', () => {
		startAgentSession('s1', 'editor_in_chief');
		// Try to jump from idle to copy_edit_run (skipping writer_delegated)
		expect(advanceTaskState('s1', 'copy_edit_run')).toBe(false);
		expect(getAgentSession('s1')!.taskWorkflow).toBe('idle');
	});

	test('rejects going backward', () => {
		startAgentSession('s1', 'editor_in_chief');
		advanceTaskState('s1', 'writer_delegated');
		advanceTaskState('s1', 'copy_edit_run');
		// Try to go back to writer_delegated
		expect(advanceTaskState('s1', 'writer_delegated')).toBe(false);
		expect(getAgentSession('s1')!.taskWorkflow).toBe('copy_edit_run');
	});

	test('rejects staying at same state', () => {
		startAgentSession('s1', 'editor_in_chief');
		// idle → idle is rejected (same state)
		expect(advanceTaskState('s1', 'idle')).toBe(false);
	});

	test('records violation on invalid transition', () => {
		startAgentSession('s1', 'editor_in_chief');
		advanceTaskState('s1', 'copy_edit_run'); // skip writer_delegated
		const session = getAgentSession('s1')!;
		expect(session.violations.length).toBeGreaterThan(0);
		expect(session.violations[0]).toContain('Invalid workflow transition');
	});

	test('returns false for unknown session', () => {
		expect(advanceTaskState('nonexistent', 'writer_delegated')).toBe(false);
	});
});

describe('beginInvocation', () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test('creates a new invocation window', () => {
		startAgentSession('s1', 'editor_in_chief');
		const before = getAgentSession('s1')!.windows.length;
		beginInvocation('s1', 'writer');
		const after = getAgentSession('s1')!.windows.length;
		expect(after).toBe(before + 1);
	});

	test('resets warningIssued on new invocation', () => {
		startAgentSession('s1', 'editor_in_chief');
		const session = getAgentSession('s1')!;
		session.warningIssued = true;
		beginInvocation('s1', 'writer');
		expect(getAgentSession('s1')!.warningIssued).toBe(false);
	});

	test('updates agentName on new invocation', () => {
		startAgentSession('s1', 'editor_in_chief');
		beginInvocation('s1', 'writer');
		expect(getAgentSession('s1')!.agentName).toBe('writer');
	});
});

describe('logGateResult', () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test('appends gate result to gateLog', () => {
		startAgentSession('s1', 'editor_in_chief');
		logGateResult('s1', 'copy_edit_check', true);
		const session = getAgentSession('s1')!;
		expect(session.gateLog.length).toBe(1);
		expect(session.gateLog[0].gate).toBe('copy_edit_check');
		expect(session.gateLog[0].passed).toBe(true);
	});

	test('is a no-op for unknown session', () => {
		// Should not throw
		logGateResult('nonexistent', 'gate', true);
	});
});

describe('markQASkipped', () => {
	beforeEach(() => {
		resetNewsroomState();
	});

	test('sets qaSkipped flag and records violation', () => {
		startAgentSession('s1', 'editor_in_chief');
		markQASkipped('s1');
		const session = getAgentSession('s1')!;
		expect(session.qaSkipped).toBe(true);
		expect(session.violations.some((v) => v.includes('QA stage skipped'))).toBe(true);
	});
});
