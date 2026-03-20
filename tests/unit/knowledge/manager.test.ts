import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	addKnowledge,
	formatKnowledgeTable,
	listKnowledge,
	listQuarantinedKnowledge,
	quarantineKnowledge,
	restoreKnowledge,
} from '../../../src/knowledge/manager';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), 'newsroom-knowledge-test-'));
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe('addKnowledge and listKnowledge', () => {
	test('adds an entry and retrieves it', async () => {
		const entry = await addKnowledge(
			tmpDir,
			'Use active voice for higher engagement.',
			'style',
		);
		expect(entry.id).toBeTruthy();
		expect(entry.content).toBe('Use active voice for higher engagement.');
		expect(entry.category).toBe('style');

		const entries = await listKnowledge(tmpDir);
		expect(entries.length).toBe(1);
		expect(entries[0].content).toBe('Use active voice for higher engagement.');
	});

	test('lists empty array when no entries', async () => {
		const entries = await listKnowledge(tmpDir);
		expect(entries).toEqual([]);
	});

	test('adds multiple entries', async () => {
		await addKnowledge(tmpDir, 'Entry 1', 'style');
		await addKnowledge(tmpDir, 'Entry 2', 'editorial');
		const entries = await listKnowledge(tmpDir);
		expect(entries.length).toBe(2);
	});

	test('entry has required fields', async () => {
		const entry = await addKnowledge(tmpDir, 'Test lesson', 'process', ['tag1']);
		expect(typeof entry.id).toBe('string');
		expect(entry.category).toBe('process');
		expect(entry.tags).toContain('tag1');
		expect(typeof entry.createdAt).toBe('string');
		expect(typeof entry.confidence).toBe('number');
	});
});

describe('quarantineKnowledge', () => {
	test('removes entry from active list', async () => {
		const entry = await addKnowledge(tmpDir, 'Entry to quarantine', 'style');
		const removed = await quarantineKnowledge(tmpDir, entry.id, 'Inaccurate advice');
		expect(removed).toBe(true);

		const active = await listKnowledge(tmpDir);
		expect(active.every((e) => e.id !== entry.id)).toBe(true);
	});

	test('moves entry to quarantine list', async () => {
		const entry = await addKnowledge(tmpDir, 'Quarantined entry', 'style');
		await quarantineKnowledge(tmpDir, entry.id, 'Test reason');

		const quarantined = await listQuarantinedKnowledge(tmpDir);
		expect(quarantined.some((e) => e.id === entry.id)).toBe(true);
	});

	test('returns false for unknown ID', async () => {
		const result = await quarantineKnowledge(tmpDir, 'Knonexistent123', 'reason');
		expect(result).toBe(false);
	});
});

describe('restoreKnowledge', () => {
	test('moves quarantined entry back to active list', async () => {
		const entry = await addKnowledge(tmpDir, 'Entry to restore', 'editorial');
		await quarantineKnowledge(tmpDir, entry.id, 'Temporary quarantine');
		const restored = await restoreKnowledge(tmpDir, entry.id);
		expect(restored).toBe(true);

		const active = await listKnowledge(tmpDir);
		expect(active.some((e) => e.id === entry.id)).toBe(true);

		const quarantined = await listQuarantinedKnowledge(tmpDir);
		expect(quarantined.every((e) => e.id !== entry.id)).toBe(true);
	});
});

describe('formatKnowledgeTable', () => {
	test('returns a message when no entries exist', async () => {
		const entries = await listKnowledge(tmpDir);
		const table = formatKnowledgeTable(entries);
		// Empty state returns an informational message, not a table
		expect(table.length).toBeGreaterThan(0);
	});

	test('returns a table with entries', async () => {
		await addKnowledge(tmpDir, 'Learn something', 'style');
		const entries = await listKnowledge(tmpDir);
		const table = formatKnowledgeTable(entries);
		expect(table).toContain('|');
		expect(table).toContain('ID');
	});

	test('includes entry data in table rows', async () => {
		await addKnowledge(tmpDir, 'Verify primary sources always.', 'factual');
		const entries = await listKnowledge(tmpDir);
		const table = formatKnowledgeTable(entries);
		expect(table).toContain('Verify primary sources always.');
	});
});
