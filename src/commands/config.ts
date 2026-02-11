import * as os from 'node:os';
import * as path from 'node:path';
import { loadPluginConfig } from '../config/loader';

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Handles the /newsroom config command.
 * Loads and displays the current resolved plugin configuration.
 */
export async function handleConfigCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const config = loadPluginConfig(directory);

	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		'opencode-newsroom.json',
	);
	const projectConfigPath = path.join(
		directory,
		'.opencode',
		'opencode-newsroom.json',
	);

	const lines = [
		'## Newsroom Configuration',
		'',
		'### Config Files',
		`\`${userConfigPath}\``,
		`\`${projectConfigPath}\``,
		'',
		'### Resolved Config',
		'```json',
		JSON.stringify(config, null, 2),
		'```',
	];

	return lines.join('\n');
}
