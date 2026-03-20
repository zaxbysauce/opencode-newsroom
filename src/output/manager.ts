/**
 * Output Manager
 *
 * Manages persistent agent output storage for the newsroom.
 * Agent outputs (article drafts, research notes, editorial reviews) are stored
 * in .newsroom/outputs/<agentType>/<outputType>-<timestamp>.md
 *
 * Adapted from opencode-swarm output manager for editorial content.
 */

import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { warn } from '../utils';

export type AgentType =
	| 'editor_in_chief'
	| 'researcher'
	| 'writer'
	| 'copy_editor'
	| 'managing_editor'
	| 'fact_checker'
	| 'humanizer'
	| 'sme'
	| 'unknown';

export type OutputType =
	| 'draft'
	| 'research'
	| 'review'
	| 'fact_check'
	| 'editorial_plan'
	| 'humanization_report'
	| 'sme_notes'
	| 'summary'
	| 'other';

export interface AgentOutputMetadata {
	id: string;
	agentType: AgentType;
	outputType: OutputType;
	taskId?: string;
	phase?: number;
	createdAt: string;
	sizeBytes: number;
}

export interface AgentOutput {
	metadata: AgentOutputMetadata;
	content: string;
}

const VALID_AGENT_TYPES = new Set<string>([
	'editor_in_chief',
	'researcher',
	'writer',
	'copy_editor',
	'managing_editor',
	'fact_checker',
	'humanizer',
	'sme',
	'unknown',
]);

const VALID_OUTPUT_TYPES = new Set<string>([
	'draft',
	'research',
	'review',
	'fact_check',
	'editorial_plan',
	'humanization_report',
	'sme_notes',
	'summary',
	'other',
]);

function outputsDir(directory: string): string {
	return path.resolve(directory, '.newsroom', 'outputs');
}

function agentOutputDir(directory: string, agentType: AgentType): string {
	if (!VALID_AGENT_TYPES.has(agentType)) {
		throw new Error(`Invalid agent type: "${agentType}"`);
	}
	return path.join(outputsDir(directory), agentType);
}

function sanitizeFilenameComponent(value: string): string {
	// Allow alphanumeric, dash, underscore only
	return value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 32);
}

/**
 * Writes an agent output atomically.
 * Returns the metadata for the stored output.
 */
export async function writeAgentOutput(
	directory: string,
	agentType: AgentType,
	outputType: OutputType,
	content: string,
	options?: { taskId?: string; phase?: number },
): Promise<AgentOutputMetadata> {
	if (!VALID_OUTPUT_TYPES.has(outputType)) {
		throw new Error(`Invalid output type: "${outputType}"`);
	}

	const dir = agentOutputDir(directory, agentType);
	mkdirSync(dir, { recursive: true });

	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
	const id = `${sanitizeFilenameComponent(outputType)}-${timestamp}`;
	const filename = `${id}.md`;
	const filePath = path.join(dir, filename);
	const tempPath = `${filePath}.tmp.${Date.now()}.${process.pid}`;

	const metadata: AgentOutputMetadata = {
		id,
		agentType,
		outputType,
		taskId: options?.taskId,
		phase: options?.phase,
		createdAt: now.toISOString(),
		sizeBytes: Buffer.byteLength(content, 'utf8'),
	};

	const metaHeader = `<!-- output-meta: ${JSON.stringify(metadata)} -->\n\n`;
	const fullContent = metaHeader + content;

	try {
		await Bun.write(tempPath, fullContent);
		renameSync(tempPath, filePath);
	} catch (error) {
		try {
			rmSync(tempPath, { force: true });
		} catch {}
		throw error;
	}

	return metadata;
}

/**
 * Reads an agent output by agent type and output ID.
 * Returns content without the metadata header.
 */
export async function readAgentOutput(
	directory: string,
	agentType: AgentType,
	outputId: string,
): Promise<AgentOutput | null> {
	if (!VALID_AGENT_TYPES.has(agentType)) return null;

	// Sanitize outputId to prevent path traversal
	if (/[/\\]|\.\./.test(outputId)) {
		warn(`Unsafe output ID requested: ${outputId}`);
		return null;
	}

	const filePath = path.join(
		agentOutputDir(directory, agentType),
		`${outputId}.md`,
	);

	try {
		statSync(filePath);
	} catch {
		return null;
	}

	try {
		const text = await Bun.file(filePath).text();
		const metaMatch = text.match(/^<!-- output-meta: (.+?) -->\n\n/);
		if (!metaMatch) {
			return {
				metadata: {
					id: outputId,
					agentType,
					outputType: 'other',
					createdAt: new Date().toISOString(),
					sizeBytes: text.length,
				},
				content: text,
			};
		}

		let metadata: AgentOutputMetadata;
		try {
			metadata = JSON.parse(metaMatch[1]);
		} catch {
			metadata = {
				id: outputId,
				agentType,
				outputType: 'other',
				createdAt: new Date().toISOString(),
				sizeBytes: text.length,
			};
		}

		const content = text.slice(metaMatch[0].length);
		return { metadata, content };
	} catch {
		return null;
	}
}

/**
 * Lists all output metadata for a given agent type, sorted by createdAt descending.
 */
export async function listAgentOutputs(
	directory: string,
	agentType?: AgentType,
): Promise<AgentOutputMetadata[]> {
	const agentTypes: AgentType[] = agentType
		? [agentType]
		: (Array.from(VALID_AGENT_TYPES) as AgentType[]);

	const allMeta: AgentOutputMetadata[] = [];

	for (const type of agentTypes) {
		const dir = path.join(outputsDir(directory), type);
		try {
			statSync(dir);
		} catch {
			continue;
		}

		let files: string[];
		try {
			files = readdirSync(dir).filter(
				(f) => f.endsWith('.md') && !f.endsWith('.tmp'),
			);
		} catch {
			continue;
		}

		for (const file of files) {
			const filePath = path.join(dir, file);
			try {
				const text = await Bun.file(filePath).text();
				const metaMatch = text.match(/^<!-- output-meta: (.+?) -->/);
				if (metaMatch) {
					try {
						const parsed = JSON.parse(metaMatch[1]);
						if (
							parsed &&
							typeof parsed.id === 'string' &&
							typeof parsed.agentType === 'string' &&
							typeof parsed.outputType === 'string' &&
							typeof parsed.createdAt === 'string' &&
							typeof parsed.sizeBytes === 'number'
						) {
							allMeta.push(parsed as AgentOutputMetadata);
						}
					} catch {
						// Malformed metadata — skip
					}
				} else {
					const stat = statSync(filePath);
					allMeta.push({
						id: file.replace(/\.md$/, ''),
						agentType: type,
						outputType: 'other',
						createdAt: stat.mtime.toISOString(),
						sizeBytes: stat.size,
					});
				}
			} catch {
				// skip unreadable files
			}
		}
	}

	// Sort by createdAt descending (newest first)
	return allMeta.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
