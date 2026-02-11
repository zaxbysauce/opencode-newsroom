import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type PluginConfig, PluginConfigSchema } from './schema';

const CONFIG_FILENAME = 'opencode-newsroom.json';
const PROMPTS_DIR_NAME = 'opencode-newsroom';

export const MAX_CONFIG_FILE_BYTES = 102_400;

function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function loadConfigFromPath(configPath: string): PluginConfig | null {
	try {
		const stats = fs.statSync(configPath);
		if (stats.size > MAX_CONFIG_FILE_BYTES) {
			console.warn(
				`[opencode-newsroom] Config file too large (max 100 KB): ${configPath}`,
			);
			return null;
		}

		const content = fs.readFileSync(configPath, 'utf-8');
		const rawConfig = JSON.parse(content);
		const result = PluginConfigSchema.safeParse(rawConfig);

		if (!result.success) {
			console.warn(`[opencode-newsroom] Invalid config at ${configPath}:`);
			console.warn(result.error.format());
			return null;
		}

		return result.data;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code !== 'ENOENT'
		) {
			console.warn(
				`[opencode-newsroom] Error reading config from ${configPath}:`,
				error.message,
			);
		}
		return null;
	}
}

export const MAX_MERGE_DEPTH = 10;

function deepMergeInternal<T extends Record<string, unknown>>(
	base: T,
	override: T,
	depth: number,
): T {
	if (depth >= MAX_MERGE_DEPTH) {
		throw new Error(`deepMerge exceeded maximum depth of ${MAX_MERGE_DEPTH}`);
	}

	const result = { ...base } as T;
	for (const key of Object.keys(override) as (keyof T)[]) {
		const baseVal = base[key];
		const overrideVal = override[key];

		if (
			typeof baseVal === 'object' &&
			baseVal !== null &&
			typeof overrideVal === 'object' &&
			overrideVal !== null &&
			!Array.isArray(baseVal) &&
			!Array.isArray(overrideVal)
		) {
			result[key] = deepMergeInternal(
				baseVal as Record<string, unknown>,
				overrideVal as Record<string, unknown>,
				depth + 1,
			) as T[keyof T];
		} else {
			result[key] = overrideVal;
		}
	}
	return result;
}

export function deepMerge<T extends Record<string, unknown>>(
	base?: T,
	override?: T,
): T | undefined {
	if (!base) return override;
	if (!override) return base;

	return deepMergeInternal(base, override, 0);
}

export function loadPluginConfig(directory: string): PluginConfig {
	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		CONFIG_FILENAME,
	);

	const projectConfigPath = path.join(directory, '.opencode', CONFIG_FILENAME);

	let config: PluginConfig = loadConfigFromPath(userConfigPath) ?? {
		max_iterations: 5,
		qa_retry_limit: 3,
		inject_phase_reminders: true,
	};

	const projectConfig = loadConfigFromPath(projectConfigPath);
	if (projectConfig) {
		config = {
			...config,
			...projectConfig,
			agents: deepMerge(config.agents, projectConfig.agents),
		};
	}

	return config;
}

export function loadAgentPrompt(agentName: string): {
	prompt?: string;
	appendPrompt?: string;
} {
	const promptsDir = path.join(
		getUserConfigDir(),
		'opencode',
		PROMPTS_DIR_NAME,
	);
	const result: { prompt?: string; appendPrompt?: string } = {};

	const promptPath = path.join(promptsDir, `${agentName}.md`);
	if (fs.existsSync(promptPath)) {
		try {
			result.prompt = fs.readFileSync(promptPath, 'utf-8');
		} catch (error) {
			console.warn(
				`[opencode-newsroom] Error reading prompt file ${promptPath}:`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	const appendPromptPath = path.join(promptsDir, `${agentName}_append.md`);
	if (fs.existsSync(appendPromptPath)) {
		try {
			result.appendPrompt = fs.readFileSync(appendPromptPath, 'utf-8');
		} catch (error) {
			console.warn(
				`[opencode-newsroom] Error reading append prompt ${appendPromptPath}:`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	return result;
}
