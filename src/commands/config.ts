import * as os from 'node:os';
import * as path from 'node:path';
import { loadPluginConfig } from '../config/loader';
import { validateToolMap } from '../config/constants';
import { PluginConfigSchema } from '../config/schema';

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Handles the /newsroom config command.
 * Subcommands:
 * - (default) — Show resolved configuration
 * - doctor — Validate configuration and report issues
 */
export async function handleConfigCommand(
	directory: string,
	args: string[],
): Promise<string> {
	const [subcommand] = args;

	if (subcommand === 'doctor') {
		return runConfigDoctor(directory);
	}

	// Default: show resolved config
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
		'',
		'_Run `/newsroom config doctor` to validate configuration._',
	];

	return lines.join('\n');
}

/**
 * Runs a health check on the configuration and reports issues.
 */
async function runConfigDoctor(directory: string): Promise<string> {
	const issues: string[] = [];
	const warnings: string[] = [];
	const passing: string[] = [];

	// 1. Load and validate config schema
	const raw = loadPluginConfig(directory);
	let config: ReturnType<typeof PluginConfigSchema.parse> | null = null;
	try {
		config = PluginConfigSchema.parse(raw ?? {});
		passing.push('Config schema validates successfully');
	} catch (error) {
		issues.push(
			`Config schema validation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// 2. Validate tool map consistency
	const toolMapErrors = validateToolMap();
	if (toolMapErrors.length === 0) {
		passing.push('Agent tool map is consistent');
	} else {
		for (const err of toolMapErrors) {
			issues.push(`Tool map: ${err}`);
		}
	}

	// 3. Check guardrails config
	if (config?.guardrails) {
		const gc = config.guardrails;
		if ((gc.loop_block_threshold ?? 5) <= (gc.loop_warning_threshold ?? 3)) {
			issues.push(
				'Guardrails: loop_block_threshold must be greater than loop_warning_threshold',
			);
		} else {
			passing.push('Guardrails loop detection thresholds are consistent');
		}
	}

	// 4. Check quality gates vs guardrails alignment
	if (config?.quality_gates?.require_copy_edit && config?.guardrails?.enforce_qa_delegation === false) {
		warnings.push(
			'quality_gates.require_copy_edit is true but guardrails.enforce_qa_delegation is false — QA may be skipped',
		);
	}

	// 5. Check scoring config
	if (config?.scoring?.enabled && config?.hooks?.scoring_injection === false) {
		warnings.push(
			'scoring.enabled is true but hooks.scoring_injection is false — scoring will not be used in system-enhancer',
		);
	}

	// 6. Check .newsroom directory exists
	const newsroomDir = path.join(directory, '.newsroom');
	try {
		const { statSync } = await import('node:fs');
		statSync(newsroomDir);
		passing.push('.newsroom directory exists');
	} catch {
		warnings.push('.newsroom directory does not exist — will be created on first use');
	}

	// 7. Check model assignments make sense
	if (config?.agents) {
		for (const [name, override] of Object.entries(config.agents)) {
			if (override.model && override.model.includes('free')) {
				warnings.push(
					`Agent "${name}" uses free-tier model "${override.model}" — may have rate limits`,
				);
			}
		}
	}

	// Build report
	const lines = ['## Config Doctor Report', ''];

	if (passing.length > 0) {
		lines.push('### ✅ Passing');
		for (const p of passing) lines.push(`- ${p}`);
		lines.push('');
	}

	if (warnings.length > 0) {
		lines.push('### ⚠️ Warnings');
		for (const w of warnings) lines.push(`- ${w}`);
		lines.push('');
	}

	if (issues.length > 0) {
		lines.push('### ❌ Issues');
		for (const issue of issues) lines.push(`- ${issue}`);
		lines.push('');
	}

	if (issues.length === 0 && warnings.length === 0) {
		lines.push('_All checks passed. Configuration is healthy._');
	}

	return lines.join('\n');
}
