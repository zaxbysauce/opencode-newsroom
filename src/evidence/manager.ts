import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
	EVIDENCE_MAX_JSON_BYTES,
	type Evidence,
	type EvidenceBundle,
	EvidenceBundleSchema,
} from '../config/evidence-schema';
import { readNewsroomFileAsync, validateNewsroomPath } from '../hooks/utils';
import { warn } from '../utils';

const TASK_ID_REGEX = /^[\w-]+(\.[\w-]+)*$/;

export function sanitizeTaskId(taskId: string): string {
	if (!taskId || taskId.length === 0) {
		throw new Error('Invalid task ID: empty string');
	}
	if (/\0/.test(taskId)) {
		throw new Error('Invalid task ID: contains null bytes');
	}
	for (let i = 0; i < taskId.length; i++) {
		if (taskId.charCodeAt(i) < 32) {
			throw new Error('Invalid task ID: contains control characters');
		}
	}
	if (
		taskId.includes('..') ||
		taskId.includes('../') ||
		taskId.includes('..\\')
	) {
		throw new Error('Invalid task ID: path traversal detected');
	}
	if (!TASK_ID_REGEX.test(taskId)) {
		throw new Error(
			`Invalid task ID: must match pattern ^[\\w-]+(\\.[\\w-]+)*$, got "${taskId}"`,
		);
	}
	return taskId;
}

export async function saveEvidence(
	directory: string,
	taskId: string,
	evidence: Evidence,
): Promise<EvidenceBundle> {
	const sanitizedTaskId = sanitizeTaskId(taskId);
	const relativePath = path.join('evidence', sanitizedTaskId, 'evidence.json');
	const evidencePath = validateNewsroomPath(directory, relativePath);
	const evidenceDir = path.dirname(evidencePath);
	let bundle: EvidenceBundle;
	const existingContent = await readNewsroomFileAsync(directory, relativePath);
	if (existingContent !== null) {
		try {
			const parsed = JSON.parse(existingContent);
			bundle = EvidenceBundleSchema.parse(parsed);
		} catch (error) {
			warn(
				`Existing evidence bundle invalid for task ${sanitizedTaskId}, creating new: ${error instanceof Error ? error.message : String(error)}`,
			);
			const now = new Date().toISOString();
			bundle = {
				schema_version: '1.0.0',
				task_id: sanitizedTaskId,
				entries: [],
				created_at: now,
				updated_at: now,
			};
		}
	} else {
		const now = new Date().toISOString();
		bundle = {
			schema_version: '1.0.0',
			task_id: sanitizedTaskId,
			entries: [],
			created_at: now,
			updated_at: now,
		};
	}
	const updatedBundle: EvidenceBundle = {
		...bundle,
		entries: [...bundle.entries, evidence],
		updated_at: new Date().toISOString(),
	};
	const bundleJson = JSON.stringify(updatedBundle);
	if (bundleJson.length > EVIDENCE_MAX_JSON_BYTES) {
		throw new Error(
			`Evidence bundle size (${bundleJson.length} bytes) exceeds maximum (${EVIDENCE_MAX_JSON_BYTES} bytes)`,
		);
	}
	mkdirSync(evidenceDir, { recursive: true });
	const tempPath = path.join(
		evidenceDir,
		`evidence.json.tmp.${Date.now()}.${process.pid}`,
	);
	try {
		await Bun.write(tempPath, bundleJson);
		renameSync(tempPath, evidencePath);
	} catch (error) {
		try {
			rmSync(tempPath, { force: true });
		} catch {}
		throw error;
	}
	return updatedBundle;
}

export async function loadEvidence(
	directory: string,
	taskId: string,
): Promise<EvidenceBundle | null> {
	const sanitizedTaskId = sanitizeTaskId(taskId);
	const relativePath = path.join('evidence', sanitizedTaskId, 'evidence.json');
	validateNewsroomPath(directory, relativePath);
	const content = await readNewsroomFileAsync(directory, relativePath);
	if (content === null) {
		return null;
	}
	try {
		const parsed = JSON.parse(content);
		const validated = EvidenceBundleSchema.parse(parsed);
		return validated;
	} catch (error) {
		warn(
			`Evidence bundle validation failed for task ${sanitizedTaskId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

export async function listEvidenceTaskIds(
	directory: string,
): Promise<string[]> {
	const evidenceBasePath = validateNewsroomPath(directory, 'evidence');
	try {
		statSync(evidenceBasePath);
	} catch {
		return [];
	}
	let entries: string[];
	try {
		entries = readdirSync(evidenceBasePath);
	} catch {
		return [];
	}
	const taskIds: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(evidenceBasePath, entry);
		try {
			const stats = statSync(entryPath);
			if (!stats.isDirectory()) {
				continue;
			}
			sanitizeTaskId(entry);
			taskIds.push(entry);
		} catch (error) {
			if (
				error instanceof Error &&
				!error.message.startsWith('Invalid task ID')
			) {
				warn(`Error reading evidence entry '${entry}': ${error.message}`);
			}
		}
	}
	return taskIds.sort();
}

export async function deleteEvidence(
	directory: string,
	taskId: string,
): Promise<boolean> {
	const sanitizedTaskId = sanitizeTaskId(taskId);
	const relativePath = path.join('evidence', sanitizedTaskId);
	const evidenceDir = validateNewsroomPath(directory, relativePath);
	try {
		statSync(evidenceDir);
	} catch {
		return false;
	}
	try {
		rmSync(evidenceDir, { recursive: true, force: true });
		return true;
	} catch (error) {
		warn(
			`Failed to delete evidence for task ${sanitizedTaskId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

export async function archiveEvidence(
	directory: string,
	maxAgeDays: number,
	maxBundles?: number,
): Promise<string[]> {
	const taskIds = await listEvidenceTaskIds(directory);
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
	const cutoffIso = cutoffDate.toISOString();
	const archived: string[] = [];
	const remainingBundles: Array<{ taskId: string; updatedAt: string }> = [];
	for (const taskId of taskIds) {
		const bundle = await loadEvidence(directory, taskId);
		if (!bundle) {
			continue;
		}
		if (bundle.updated_at < cutoffIso) {
			const deleted = await deleteEvidence(directory, taskId);
			if (deleted) {
				archived.push(taskId);
			}
		} else {
			remainingBundles.push({
				taskId,
				updatedAt: bundle.updated_at,
			});
		}
	}
	if (maxBundles !== undefined && remainingBundles.length > maxBundles) {
		remainingBundles.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
		const toDelete = remainingBundles.length - maxBundles;
		for (let i = 0; i < toDelete; i++) {
			const deleted = await deleteEvidence(
				directory,
				remainingBundles[i].taskId,
			);
			if (deleted) {
				archived.push(remainingBundles[i].taskId);
			}
		}
	}
	return archived;
}
