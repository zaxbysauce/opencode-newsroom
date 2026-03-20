/**
 * Knowledge Manager
 *
 * Manages an editorial knowledge base: lessons learned, style patterns,
 * source reliability notes, and editorial decisions that should persist
 * across sessions and articles.
 *
 * Storage: .newsroom/knowledge.jsonl (one JSON object per line)
 * Quarantined entries: .newsroom/knowledge-quarantine.jsonl
 *
 * Adapted from opencode-swarm knowledge system for editorial context.
 */

import { mkdirSync, renameSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { warn } from '../utils';
import { generateKnowledgeId, validateKnowledgeId } from './identity';

export interface KnowledgeEntry {
	id: string;
	content: string;
	category: 'style' | 'source' | 'process' | 'editorial' | 'factual' | 'other';
	confidence: number; // 0.0 – 1.0
	tags: string[];
	createdAt: string;
	updatedAt: string;
	quarantined?: boolean;
	quarantineReason?: string;
}

const KNOWLEDGE_FILE = 'knowledge.jsonl';
const QUARANTINE_FILE = 'knowledge-quarantine.jsonl';
const MIGRATE_SENTINEL = 'knowledge-migrated.sentinel';

function newsroomDir(directory: string): string {
	return path.resolve(directory, '.newsroom');
}

function knowledgePath(directory: string): string {
	return path.join(newsroomDir(directory), KNOWLEDGE_FILE);
}

function quarantinePath(directory: string): string {
	return path.join(newsroomDir(directory), QUARANTINE_FILE);
}

function migrateSentinelPath(directory: string): string {
	return path.join(newsroomDir(directory), MIGRATE_SENTINEL);
}

/**
 * Parses a JSONL file and returns valid KnowledgeEntry objects.
 */
async function parseKnowledgeFile(
	filePath: string,
): Promise<KnowledgeEntry[]> {
	try {
		const file = Bun.file(filePath);
		const text = await file.text();
		if (!text.trim()) return [];

		const entries: KnowledgeEntry[] = [];
		for (const line of text.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const entry = JSON.parse(trimmed) as KnowledgeEntry;
				if (entry?.id && entry?.content) {
					entries.push(entry);
				}
			} catch {
				warn(`Skipping malformed knowledge entry: ${trimmed.slice(0, 80)}`);
			}
		}
		return entries;
	} catch {
		return [];
	}
}

/**
 * Atomically writes a JSONL file from an array of entries.
 */
async function writeKnowledgeFile(
	filePath: string,
	entries: KnowledgeEntry[],
): Promise<void> {
	const dir = path.dirname(filePath);
	mkdirSync(dir, { recursive: true });

	const tempPath = `${filePath}.tmp.${Date.now()}.${process.pid}`;
	const content = entries.map((e) => JSON.stringify(e)).join('\n');

	try {
		await Bun.write(tempPath, content ? `${content}\n` : '');
		renameSync(tempPath, filePath);
	} catch (error) {
		try {
			rmSync(tempPath, { force: true });
		} catch {}
		throw error;
	}
}

/**
 * Lists all active (non-quarantined) knowledge entries.
 */
export async function listKnowledge(
	directory: string,
): Promise<KnowledgeEntry[]> {
	return parseKnowledgeFile(knowledgePath(directory));
}

/**
 * Lists all quarantined knowledge entries.
 */
export async function listQuarantinedKnowledge(
	directory: string,
): Promise<KnowledgeEntry[]> {
	return parseKnowledgeFile(quarantinePath(directory));
}

/**
 * Adds a new knowledge entry.
 */
export async function addKnowledge(
	directory: string,
	content: string,
	category: KnowledgeEntry['category'] = 'other',
	tags: string[] = [],
	confidence = 0.7,
): Promise<KnowledgeEntry> {
	const id = generateKnowledgeId();
	const now = new Date().toISOString();

	const entry: KnowledgeEntry = {
		id,
		content,
		category,
		confidence: Math.min(1, Math.max(0, confidence)),
		tags,
		createdAt: now,
		updatedAt: now,
	};

	const existing = await listKnowledge(directory);
	existing.push(entry);
	await writeKnowledgeFile(knowledgePath(directory), existing);

	return entry;
}

/**
 * Quarantines a knowledge entry by ID with an optional reason.
 * Removes from active file, appends to quarantine file.
 */
export async function quarantineKnowledge(
	directory: string,
	id: string,
	reason?: string,
): Promise<boolean> {
	try {
		validateKnowledgeId(id);
	} catch (e) {
		throw new Error(
			`Invalid knowledge ID: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	const active = await listKnowledge(directory);
	const idx = active.findIndex((e) => e.id === id);
	if (idx === -1) return false;

	const [entry] = active.splice(idx, 1);
	const quarantined: KnowledgeEntry = {
		...entry,
		quarantined: true,
		quarantineReason: reason,
		updatedAt: new Date().toISOString(),
	};

	await writeKnowledgeFile(knowledgePath(directory), active);

	const existing = await listQuarantinedKnowledge(directory);
	existing.push(quarantined);
	await writeKnowledgeFile(quarantinePath(directory), existing);

	return true;
}

/**
 * Restores a quarantined knowledge entry back to the active file.
 */
export async function restoreKnowledge(
	directory: string,
	id: string,
): Promise<boolean> {
	try {
		validateKnowledgeId(id);
	} catch (e) {
		throw new Error(
			`Invalid knowledge ID: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	const quarantined = await listQuarantinedKnowledge(directory);
	const idx = quarantined.findIndex((e) => e.id === id);
	if (idx === -1) return false;

	const [entry] = quarantined.splice(idx, 1);
	const restored: KnowledgeEntry = {
		...entry,
		quarantined: undefined,
		quarantineReason: undefined,
		updatedAt: new Date().toISOString(),
	};

	await writeKnowledgeFile(quarantinePath(directory), quarantined);

	const active = await listKnowledge(directory);
	active.push(restored);
	await writeKnowledgeFile(knowledgePath(directory), active);

	return true;
}

/**
 * Migrates editorial notes from context.md into knowledge.jsonl.
 * Creates a sentinel file to prevent re-running.
 * Only migrates sections that look like editorial lessons/decisions.
 */
export async function migrateFromContextMd(
	directory: string,
): Promise<{ migrated: number; skipped: boolean }> {
	const sentinelPath = migrateSentinelPath(directory);

	// Check sentinel
	try {
		Bun.file(sentinelPath);
		const sentinel = await Bun.file(sentinelPath).text();
		if (sentinel.trim().length > 0) {
			return { migrated: 0, skipped: true };
		}
	} catch {
		// Sentinel doesn't exist — proceed
	}

	const contextPath = path.join(newsroomDir(directory), 'context.md');
	let contextContent: string;
	try {
		contextContent = await Bun.file(contextPath).text();
	} catch {
		// No context.md — write sentinel and return
		mkdirSync(newsroomDir(directory), { recursive: true });
		await Bun.write(sentinelPath, new Date().toISOString());
		return { migrated: 0, skipped: false };
	}

	// Extract bullet points from ## Key Decisions and ## Editorial Patterns sections
	const extractedItems: string[] = [];
	const sections = contextContent.split(/^##\s+/m);
	for (const section of sections) {
		const lowerSection = section.toLowerCase();
		if (
			lowerSection.startsWith('key decision') ||
			lowerSection.startsWith('editorial pattern') ||
			lowerSection.startsWith('lessons') ||
			lowerSection.startsWith('style note')
		) {
			const bullets = section
				.split('\n')
				.filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
				.map((l) => l.replace(/^[\s\-*]+/, '').trim())
				.filter((l) => l.length > 10);
			extractedItems.push(...bullets);
		}
	}

	let migrated = 0;
	for (const item of extractedItems) {
		try {
			await addKnowledge(directory, item, 'editorial', ['migrated'], 0.6);
			migrated++;
		} catch {
			// Skip failures
		}
	}

	// Write sentinel
	await Bun.write(sentinelPath, new Date().toISOString());

	return { migrated, skipped: false };
}

/**
 * Formats knowledge entries as a markdown table.
 */
export function formatKnowledgeTable(entries: KnowledgeEntry[]): string {
	if (entries.length === 0) {
		return '_No knowledge entries found._';
	}

	const header =
		'| ID | Content | Category | Confidence | Tags |\n|---|---|---|---|---|';
	const rows = entries.map((e) => {
		const truncated =
			e.content.length > 60 ? `${e.content.slice(0, 57)}…` : e.content;
		const pct = Math.round(e.confidence * 100);
		const tags = e.tags.length > 0 ? e.tags.join(', ') : '—';
		return `| ${e.id} | ${truncated} | ${e.category} | ${pct}% | ${tags} |`;
	});

	return [header, ...rows].join('\n');
}
