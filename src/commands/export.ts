import { readNewsroomFileAsync } from '../hooks/utils';
import { loadPlanJsonOnly } from '../plan/manager';

/**
 * Handles the /newsroom export command.
 * Exports plan.md and context.md as a portable JSON object.
 */
export async function handleExportCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const planStructured = await loadPlanJsonOnly(directory);
	const planContent = await readNewsroomFileAsync(directory, 'plan.md');
	const contextContent = await readNewsroomFileAsync(directory, 'context.md');

	const exportData = {
		version: '1.0.0',
		exported: new Date().toISOString(),
		plan: planStructured || planContent, // structured Plan object if available, else markdown
		context: contextContent,
	};

	const lines = [
		'## Newsroom Export',
		'',
		'```json',
		JSON.stringify(exportData, null, 2),
		'```',
	];

	return lines.join('\n');
}
