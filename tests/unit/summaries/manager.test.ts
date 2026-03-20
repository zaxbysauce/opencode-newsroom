import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	listSummaries,
	loadSummary,
	nextSummaryId,
	storeSummary,
	validateSummaryId,
} from '../../../src/summaries/manager';
import type { SummaryMetadata } from '../../../src/summaries/manager';

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), 'newsroom-test-'));
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

function makeMeta(id: string): SummaryMetadata {
	return {
		id,
		agentName: 'writer',
		contentType: 'text',
		originalLength: 5000,
		summaryLength: 200,
		createdAt: new Date().toISOString(),
	};
}

describe('validateSummaryId', () => {
	test('accepts valid IDs', () => {
		expect(validateSummaryId('S1')).toBe('S1');
		expect(validateSummaryId('S99')).toBe('S99');
		expect(validateSummaryId('S123456')).toBe('S123456');
	});

	test('rejects empty string', () => {
		expect(() => validateSummaryId('')).toThrow('empty string');
	});

	test('rejects path traversal', () => {
		expect(() => validateSummaryId('../S1')).toThrow('path traversal');
		expect(() => validateSummaryId('S1/foo')).toThrow('path traversal');
	});

	test('rejects IDs not matching S followed by digits', () => {
		expect(() => validateSummaryId('1')).toThrow('Invalid summary ID');
		expect(() => validateSummaryId('S')).toThrow('Invalid summary ID');
		expect(() => validateSummaryId('SA')).toThrow('Invalid summary ID');
	});
});

describe('storeSummary and loadSummary', () => {
	test('round-trips metadata and content', async () => {
		const meta = makeMeta('S1');
		await storeSummary(tmpDir, meta, 'This is the summary content.');

		const loaded = await loadSummary(tmpDir, 'S1');
		expect(loaded).not.toBeNull();
		expect(loaded!.metadata.id).toBe('S1');
		expect(loaded!.metadata.agentName).toBe('writer');
		expect(loaded!.content).toBe('This is the summary content.');
	});

	test('returns null for non-existent ID', async () => {
		const result = await loadSummary(tmpDir, 'S999');
		expect(result).toBeNull();
	});

	test('returns null for invalid ID', async () => {
		const result = await loadSummary(tmpDir, '../hack');
		expect(result).toBeNull();
	});
});

describe('listSummaries', () => {
	test('returns empty array when no summaries exist', async () => {
		const ids = await listSummaries(tmpDir);
		expect(ids).toEqual([]);
	});

	test('returns sorted IDs after storing summaries', async () => {
		await storeSummary(tmpDir, makeMeta('S3'), 'content 3');
		await storeSummary(tmpDir, makeMeta('S1'), 'content 1');
		await storeSummary(tmpDir, makeMeta('S2'), 'content 2');

		const ids = await listSummaries(tmpDir);
		expect(ids).toEqual(['S1', 'S2', 'S3']);
	});
});

describe('nextSummaryId', () => {
	test('returns S1 for empty directory', async () => {
		expect(await nextSummaryId(tmpDir)).toBe('S1');
	});

	test('increments from existing IDs', async () => {
		await storeSummary(tmpDir, makeMeta('S1'), 'content 1');
		await storeSummary(tmpDir, makeMeta('S2'), 'content 2');
		expect(await nextSummaryId(tmpDir)).toBe('S3');
	});
});
