import type { AgentDefinition } from '../agents';
import { loadPluginConfig } from '../config/loader';
import { GuardrailsConfigSchema } from '../config/schema';
import { handleAgentsCommand } from './agents';
import { handleArchiveCommand } from './archive';
import { handleConfigCommand } from './config';
import { handleDiagnoseCommand } from './diagnose';
import { handleEvidenceCommand } from './evidence';
import { handleExportCommand } from './export';
import { handleHistoryCommand } from './history';
import { handlePlanCommand } from './plan';
import { handleResetCommand } from './reset';
import { handleStatusCommand } from './status';

// Re-export individual handlers
export { handleAgentsCommand } from './agents';
export { handleArchiveCommand } from './archive';
export { handleConfigCommand } from './config';
export { handleDiagnoseCommand } from './diagnose';
export { handleEvidenceCommand } from './evidence';
export { handleExportCommand } from './export';
export { handleHistoryCommand } from './history';
export { handlePlanCommand } from './plan';
export { handleResetCommand } from './reset';
export { handleStatusCommand } from './status';

const HELP_TEXT = [
	'## Newsroom Commands',
	'',
	'- `/newsroom status` — Show current newsroom state',
	'- `/newsroom plan [phase]` — Show plan (optionally filter by phase number)',
	'- `/newsroom agents` — List registered agents',
	'- `/newsroom history` — Show completed phases summary',
	'- `/newsroom config` — Show current resolved configuration',
	'- `/newsroom evidence [taskId]` — Show evidence bundles',
	'- `/newsroom archive [--dry-run]` — Archive old evidence bundles',
	'- `/newsroom diagnose` — Run health check on newsroom state',
	'- `/newsroom export` — Export plan and context as JSON',
	'- `/newsroom reset --confirm` — Clear newsroom state files',
].join('\n');

/**
 * Creates a command.execute.before handler for /newsroom commands.
 * Uses factory pattern to close over directory and agents.
 */
export function createNewsroomCommandHandler(
	directory: string,
	agents: Record<string, AgentDefinition>,
): (
	input: { command: string; sessionID: string; arguments: string },
	output: { parts: unknown[] },
) => Promise<void> {
	return async (input, output) => {
		// Ignore non-newsroom commands
		if (input.command !== 'newsroom') {
			return;
		}

		// Parse arguments
		const tokens = input.arguments.trim().split(/\s+/).filter(Boolean);
		const [subcommand, ...args] = tokens;

		let text: string;

		switch (subcommand) {
			case 'status':
				text = await handleStatusCommand(directory, agents);
				break;
			case 'plan':
				text = await handlePlanCommand(directory, args);
				break;
			case 'agents': {
				// Load guardrails config for profile display
				const pluginConfig = loadPluginConfig(directory);
				const guardrailsConfig = pluginConfig?.guardrails
					? GuardrailsConfigSchema.parse(pluginConfig.guardrails)
					: undefined;
				text = handleAgentsCommand(agents, guardrailsConfig);
				break;
			}
			case 'archive':
				text = await handleArchiveCommand(directory, args);
				break;
			case 'history':
				text = await handleHistoryCommand(directory, args);
				break;
			case 'config':
				text = await handleConfigCommand(directory, args);
				break;
			case 'evidence':
				text = await handleEvidenceCommand(directory, args);
				break;
			case 'diagnose':
				text = await handleDiagnoseCommand(directory, args);
				break;
			case 'export':
				text = await handleExportCommand(directory, args);
				break;
			case 'reset':
				text = await handleResetCommand(directory, args);
				break;
			default:
				text = HELP_TEXT;
				break;
		}

		// Convert string result to Part[]
		output.parts = [
			{ type: 'text', text } as unknown as (typeof output.parts)[number],
		];
	};
}
