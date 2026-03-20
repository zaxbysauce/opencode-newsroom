/**
 * Summary Manager
 *
 * Provides atomic storage and retrieval of agent output summaries.
 * Summaries are stored in .newsroom/summaries/ with IDs of the form S1, S2, etc.
 * Includes path safety validation, atomic writes, and retention-based cleanup.
 */

import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { warn } from '../utils';

// Summary ID must be S followed by 1-6 digits (e.g. S1, S99, S123456)
const SUMMARY_ID_REGEX = /^S\d{1,6}$/;


export interface SummaryMetadata {
	id: string;
	agentName: string;
	contentType: 'text' | 'json' | 'code' | 'markdown';
	originalLength: number;
	summaryLength: number;
	createdAt: string;
}

export interface StoredSummary {
	metadata: SummaryMetadata;
	content: string;
}

/**
 * Validates a summary ID for use in file paths.
 * Rejects path traversal, control characters, and malformed IDs.
 */
export function validateSummaryId(id: string): string {
	if (!id || id.length === 0) {
		throw new Error('Invalid summary ID: empty string');
	}
	if (/[\0]/.test(id)) {
		throw new Error('Invalid summary ID: contains null bytes');
	}
	for (let i = 0; i < id.length; i++) {
		if (id.charCodeAt(i) < 32) {
			throw new Error('Invalid summary ID: contains control characters');
		}
	}
	if (id.includes('..') || id.includes('/') || id.includes('\\')) {
		throw new Error('Invalid summary ID: path traversal detected');
	}
	if (!SUMMARY_ID_REGEX.test(id)) {
		throw new Error(
			`Invalid summary ID: must match S followed by 1-6 digits (e.g. S1, S99), got "${id}"`,
		);
	}
	return id;
}


/**
 * Returns the base path for summaries directory.
 */
function summariesDir(directory: string): string {
	return path.resolve(directory, '.newsroom', 'summaries');
}

/**
 * Returns the file path for a specific summary.
 */
function summaryPath(directory: string, id: string): string {
	validateSummaryId(id);
	return path.join(summariesDir(directory), `${id}.json`);
}

/**
 * Stores a summary atomically (temp file + rename).
 */
export async function storeSummary(
	directory: string,
	metadata: SummaryMetadata,
	content: string,
): Promise<void> {
	validateSummaryId(metadata.id);

	const dir = summariesDir(directory);
	mkdirSync(dir, { recursive: true });

	const filePath = summaryPath(directory, metadata.id);
	const tempPath = `${filePath}.tmp.${Date.now()}.${process.pid}`;

	const stored: StoredSummary = { metadata, content };
	const json = JSON.stringify(stored, null, 2);

	try {
		await Bun.write(tempPath, json);
		renameSync(tempPath, filePath);
	} catch (error) {
		try {
			rmSync(tempPath, { force: true });
		} catch {}
		throw error;
	}
}

/**
 * Loads a summary by ID. Returns null if not found or invalid.
 */
export async function loadSummary(
	directory: string,
	id: string,
): Promise<StoredSummary | null> {
	try {
		validateSummaryId(id);
	} catch {
		return null;
	}

	const filePath = summaryPath(directory, id);
	try {
		const file = Bun.file(filePath);
		const text = await file.text();
		const parsed = JSON.parse(text);
		if (!parsed?.metadata?.id || typeof parsed.content !== 'string') {
			warn(`Invalid summary format for ${id}`);
			return null;
		}
		return parsed as StoredSummary;
	} catch {
		return null;
	}
}

/**
 * Loads the full original content stored for a summary (alias for readability).
 */
export async function loadFullOutput(
	directory: string,
	id: string,
): Promise<string | null> {
	const summary = await loadSummary(directory, id);
	return summary?.content ?? null;
}

/**
 * Lists all summary IDs sorted by numeric value (S1 < S2 < S10).
 */
export async function listSummaries(directory: string): Promise<string[]> {
	const dir = summariesDir(directory);
	try {
		statSync(dir);
	} catch {
		return [];
	}

	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}

	const ids: string[] = [];
	for (const entry of entries) {
		if (!entry.endsWith('.json') || entry.endsWith('.tmp')) continue;
		const id = entry.slice(0, -5); // remove .json
		try {
			validateSummaryId(id);
			ids.push(id);
		} catch {
			// skip invalid files
		}
	}

	// Sort numerically: S1, S2, ..., S10
	return ids.sort((a, b) => {
		const numA = Number.parseInt(a.slice(1), 10);
		const numB = Number.parseInt(b.slice(1), 10);
		return numA - numB;
	});
}

/**
 * Deletes a summary by ID. Returns true if deleted, false if not found.
 */
export async function deleteSummary(
	directory: string,
	id: string,
): Promise<boolean> {
	try {
		validateSummaryId(id);
	} catch {
		return false;
	}

	const filePath = summaryPath(directory, id);
	try {
		statSync(filePath);
		rmSync(filePath, { force: true });
		return true;
	} catch {
		return false;
	}
}

/**
 * Removes old summaries exceeding the retention limit.
 * Keeps the most recent `maxCount` summaries.
 */
export async function cleanupSummaries(
	directory: string,
	maxCount: number,
): Promise<string[]> {
	const ids = await listSummaries(directory);
	if (ids.length <= maxCount) return [];

	// ids are sorted numerically ascending — remove the oldest (lowest numbers)
	const toRemove = ids.slice(0, ids.length - maxCount);
	const removed: string[] = [];

	for (const id of toRemove) {
		const deleted = await deleteSummary(directory, id);
		if (deleted) removed.push(id);
	}

	return removed;
}

/**
 * Generates the next available summary ID (S1, S2, ...).
 */
export async function nextSummaryId(directory: string): Promise<string> {
	const ids = await listSummaries(directory);
	if (ids.length === 0) return 'S1';
	const last = ids[ids.length - 1];
	const lastNum = Number.parseInt(last.slice(1), 10);
	return `S${lastNum + 1}`;
}

