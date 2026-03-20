/**
 * Knowledge Command Handler
 *
 * Handles /newsroom knowledge subcommands:
 * - list: display all knowledge entries in markdown table
 * - quarantine <id> [reason]: remove an entry from active knowledge
 * - restore <id>: recover a quarantined entry
 * - migrate: one-time migration from context.md to knowledge.jsonl
 */

import {
	formatKnowledgeTable,
	listKnowledge,
	listQuarantinedKnowledge,
	migrateFromContextMd,
	quarantineKnowledge,
	restoreKnowledge,
} from '../knowledge';

export async function handleKnowledgeCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const [subcommand, ...rest] = args;

	switch (subcommand) {
		case 'list': {
			const entries = await listKnowledge(directory);
			const table = formatKnowledgeTable(entries);
			const quarantined = await listQuarantinedKnowledge(directory);
			const lines = [
				'## Newsroom Knowledge Base',
				'',
				table,
			];
			if (quarantined.length > 0) {
				lines.push(
					'',
					`_${quarantined.length} quarantined ${quarantined.length === 1 ? 'entry' : 'entries'} hidden. Use \`/newsroom knowledge list-quarantined\` to view._`,
				);
			}
			return lines.join('\n');
		}

		case 'list-quarantined': {
			const entries = await listQuarantinedKnowledge(directory);
			if (entries.length === 0) {
				return '_No quarantined knowledge entries._';
			}
			const table = formatKnowledgeTable(entries);
			return `## Quarantined Knowledge Entries\n\n${table}`;
		}

		case 'quarantine': {
			const [id, ...reasonParts] = rest;
			if (!id) {
				return '❌ Usage: `/newsroom knowledge quarantine <id> [reason]`';
			}
			const reason = reasonParts.join(' ') || undefined;
			try {
				const removed = await quarantineKnowledge(directory, id, reason);
				if (!removed) {
					return `❌ Knowledge entry "${id}" not found in active knowledge base.`;
				}
				const reasonNote = reason ? ` Reason: ${reason}` : '';
				return `✅ Entry "${id}" quarantined.${reasonNote}`;
			} catch (error) {
				return `❌ ${error instanceof Error ? error.message : String(error)}`;
			}
		}

		case 'restore': {
			const [id] = rest;
			if (!id) {
				return '❌ Usage: `/newsroom knowledge restore <id>`';
			}
			try {
				const restored = await restoreKnowledge(directory, id);
				if (!restored) {
					return `❌ Entry "${id}" not found in quarantine.`;
				}
				return `✅ Entry "${id}" restored to active knowledge base.`;
			} catch (error) {
				return `❌ ${error instanceof Error ? error.message : String(error)}`;
			}
		}

		case 'migrate': {
			const { migrated, skipped } = await migrateFromContextMd(directory);
			if (skipped) {
				return '⚠️ Migration already completed (sentinel file exists). Run again not needed.';
			}
			if (migrated === 0) {
				return 'Migration complete. No knowledge entries found in context.md to migrate.';
			}
			return `✅ Migration complete. ${migrated} ${migrated === 1 ? 'entry' : 'entries'} migrated from context.md to .newsroom/knowledge.jsonl.`;
		}

		default: {
			return [
				'## Knowledge Commands',
				'',
				'- `/newsroom knowledge list` — List all knowledge entries',
				'- `/newsroom knowledge list-quarantined` — List quarantined entries',
				'- `/newsroom knowledge quarantine <id> [reason]` — Quarantine an entry',
				'- `/newsroom knowledge restore <id>` — Restore a quarantined entry',
				'- `/newsroom knowledge migrate` — Migrate context.md notes to knowledge.jsonl',
			].join('\n');
		}
	}
}
