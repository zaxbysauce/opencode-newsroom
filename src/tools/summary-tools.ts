/**
 * Summary Tools
 *
 * Tools for agents to retrieve stored article drafts and research summaries:
 * - retrieve_summary: load a stored summary by ID
 * - pre_check_batch: run pre-publication checks (AI detection heuristic, readability)
 * - evidence_check: verify evidence bundle exists for a task
 *
 * Adapted from opencode-swarm for editorial context.
 */

import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import { loadEvidence } from '../evidence/manager';
import { listSummaries, loadSummary } from '../summaries/manager';

/**
 * retrieve_summary — Load a stored summary by ID.
 * Agents use this to access previously compressed tool outputs.
 */
export function createRetrieveSummaryTool(directory: string): ToolDefinition {
	return tool({
		description:
			'Retrieve a stored summary by ID (e.g. S1, S2, S10). ' +
			'Summaries are compressed versions of previous agent outputs: drafts, research notes, reviews. ' +
			'Use "list" as the id to see all available summaries.',
		args: {
			id: tool.schema
				.string()
				.describe(
					'The summary ID to retrieve (e.g. S1, S15), or "list" to see all available summaries',
				),
		},
		execute: async (args) => {
			if (args.id === 'list') {
				const ids = await listSummaries(directory);
				if (ids.length === 0) {
					return 'No summaries stored yet.';
				}
				return `Available summaries: ${ids.join(', ')}`;
			}

			const summary = await loadSummary(directory, args.id);
			if (!summary) {
				const ids = await listSummaries(directory);
				const hint = ids.length > 0 ? ` Available IDs: ${ids.join(', ')}` : '';
				return `Summary "${args.id}" not found.${hint}`;
			}

			const { metadata, content } = summary;
			const header =
				`[Summary ${metadata.id} | Agent: ${metadata.agentName} | ` +
				`Type: ${metadata.contentType} | ` +
				`Original: ${metadata.originalLength} chars → ${metadata.summaryLength} chars]\n\n`;

			return header + content;
		},
	});
}

/**
 * evidence_check — Verify that an evidence bundle exists for a task.
 * QA agents use this to confirm the writer submitted evidence before reviewing.
 */
export function createEvidenceCheckTool(directory: string): ToolDefinition {
	return tool({
		description:
			'Check whether an evidence bundle exists for a specific task. ' +
			'QA agents (copy_editor, managing_editor, fact_checker) should call this ' +
			'before reviewing to confirm the writer has submitted their work evidence. ' +
			'Returns evidence details if found, or a clear "not found" message.',
		args: {
			task_id: tool.schema
				.string()
				.describe('The task ID to check for evidence (e.g. "1.1", "2.3")'),
		},
		execute: async (args) => {
			try {
				const bundle = await loadEvidence(directory, args.task_id);
				if (!bundle) {
					return (
						`❌ No evidence bundle found for task "${args.task_id}". ` +
						'The writer must submit evidence before QA review can proceed.'
					);
				}

				const entryCount = bundle.entries.length;
				const types = [...new Set(bundle.entries.map((e) => e.type))].join(
					', ',
				);
				return (
					`✅ Evidence bundle found for task "${args.task_id}":\n` +
					`  Entries: ${entryCount}\n` +
					`  Types: ${types}\n` +
					`  Updated: ${bundle.updated_at}`
				);
			} catch (error) {
				return `Error checking evidence: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}

/**
 * pre_check_batch — Run a batch of pre-publication checks.
 * Checks for common AI writing patterns, readability, and basic quality.
 */
export function createPreCheckBatchTool(): ToolDefinition {
	return tool({
		description:
			'Run pre-publication quality checks on article content. ' +
			'Checks for: AI writing pattern indicators, readability estimate, ' +
			'passive voice density, and common editorial issues. ' +
			'Returns a report with pass/warn/fail for each check.',
		args: {
			content: tool.schema
				.string()
				.describe('The article text to check'),
			checks: tool.schema
				.array(
					tool.schema.enum([
						'ai_patterns',
						'readability',
						'passive_voice',
						'sentence_length',
						'word_count',
					]),
				)
				.optional()
				.describe(
					'Which checks to run. Defaults to all checks if not specified.',
				),
		},
		execute: async (args) => {
			const text = args.content;
			const checks = args.checks ?? [
				'ai_patterns',
				'readability',
				'passive_voice',
				'sentence_length',
				'word_count',
			];

			const results: string[] = ['## Pre-Publication Check Results\n'];

			// AI pattern indicators
			if (checks.includes('ai_patterns')) {
				const aiPatterns = [
					'delve',
					'tapestry',
					'nuanced',
					'multifaceted',
					'it is worth noting',
					'it is important to note',
					'in conclusion',
					'in summary',
					'furthermore',
					'moreover',
					'nevertheless',
					'subsequently',
					'utilize',
					'leverage',
					'robust',
					'seamless',
					'paradigm',
					'holistic',
					'synergy',
				];
				const lowerText = text.toLowerCase();
				const found = aiPatterns.filter((p) => lowerText.includes(p));
				if (found.length === 0) {
					results.push('✅ AI patterns: None detected');
				} else if (found.length <= 2) {
					results.push(`⚠️ AI patterns: ${found.length} found (${found.join(', ')})`);
				} else {
					results.push(
						`❌ AI patterns: ${found.length} found (${found.join(', ')}) — rewrite to remove`,
					);
				}
			}

			// Word count
			if (checks.includes('word_count')) {
				const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
				results.push(`ℹ️ Word count: ${wordCount.toLocaleString()}`);
			}

			// Sentence length
			if (checks.includes('sentence_length')) {
				const sentences = text
					.split(/[.!?]+/)
					.filter((s) => s.trim().length > 0);
				if (sentences.length > 0) {
					const lengths = sentences.map(
						(s) => s.split(/\s+/).filter((w) => w.length > 0).length,
					);
					const avgLen = Math.round(
						lengths.reduce((a, b) => a + b, 0) / lengths.length,
					);
					const longSentences = lengths.filter((l) => l > 30).length;

					if (avgLen <= 18 && longSentences === 0) {
						results.push(`✅ Sentence length: avg ${avgLen} words (good)`);
					} else if (avgLen <= 22 && longSentences <= 2) {
						results.push(
							`⚠️ Sentence length: avg ${avgLen} words, ${longSentences} very long`,
						);
					} else {
						results.push(
							`❌ Sentence length: avg ${avgLen} words, ${longSentences} very long (>30 words) — break up`,
						);
					}
				}
			}

			// Passive voice (heuristic)
			if (checks.includes('passive_voice')) {
				const passivePattern =
					/\b(is|are|was|were|be|been|being)\s+([\w]+ed|[\w]+en)\b/gi;
				const matches = text.match(passivePattern) || [];
				const sentences = text
					.split(/[.!?]+/)
					.filter((s) => s.trim().length > 0).length;
				const pct =
					sentences > 0 ? Math.round((matches.length / sentences) * 100) : 0;

				if (pct <= 10) {
					results.push(`✅ Passive voice: ~${pct}% of sentences`);
				} else if (pct <= 25) {
					results.push(`⚠️ Passive voice: ~${pct}% of sentences (aim for <20%)`);
				} else {
					results.push(`❌ Passive voice: ~${pct}% of sentences — rewrite to active`);
				}
			}

			// Readability (Flesch-Kincaid approximation)
			if (checks.includes('readability')) {
				const words = text.split(/\s+/).filter((w) => w.length > 0);
				const sentences = text
					.split(/[.!?]+/)
					.filter((s) => s.trim().length > 0);
				if (words.length > 0 && sentences.length > 0) {
					// Count syllables (rough approximation)
					const syllables = words.reduce((sum, word) => {
						const vowelGroups = word
							.toLowerCase()
							.replace(/[^a-z]/g, '')
							.match(/[aeiouy]+/g);
						return sum + Math.max(1, vowelGroups?.length ?? 1);
					}, 0);

					const avgSyllables = syllables / words.length;
					const avgWords = words.length / sentences.length;
					// Flesch Reading Ease (approx)
					const score = 206.835 - 1.015 * avgWords - 84.6 * avgSyllables;

					if (score >= 60) {
						results.push(
							`✅ Readability: ~${Math.round(score)} Flesch score (easy/standard)`,
						);
					} else if (score >= 40) {
						results.push(
							`⚠️ Readability: ~${Math.round(score)} Flesch score (fairly difficult)`,
						);
					} else {
						results.push(
							`❌ Readability: ~${Math.round(score)} Flesch score (very difficult) — simplify`,
						);
					}
				}
			}

			return results.join('\n');
		},
	});
}
