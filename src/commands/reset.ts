import * as fs from 'node:fs';
import { validateNewsroomPath } from '../hooks/utils';

/**
 * Handles the /newsroom reset command.
 * Clears plan.md and context.md from .newsroom/ directory.
 * Requires --confirm flag as a safety gate.
 */
export async function handleResetCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const hasConfirm = args.includes('--confirm');

	if (!hasConfirm) {
		return [
			'## Newsroom Reset',
			'',
			'⚠️ This will delete plan.md and context.md from .newsroom/',
			'',
			'**Tip**: Run `/newsroom export` first to backup your state.',
			'',
			'To confirm, run: `/newsroom reset --confirm`',
		].join('\n');
	}

	const filesToReset = ['plan.md', 'context.md'];
	const results: string[] = [];

	for (const filename of filesToReset) {
		try {
			const resolvedPath = validateNewsroomPath(directory, filename);
			if (fs.existsSync(resolvedPath)) {
				fs.unlinkSync(resolvedPath);
				results.push(`- ✅ Deleted ${filename}`);
			} else {
				results.push(`- ⏭️ ${filename} not found (skipped)`);
			}
		} catch {
			results.push(`- ❌ Failed to delete ${filename}`);
		}
	}

	return [
		'## Newsroom Reset Complete',
		'',
		...results,
		'',
		'Newsroom state has been cleared. Start fresh with a new plan.',
	].join('\n');
}
