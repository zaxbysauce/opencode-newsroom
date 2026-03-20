// QA agents (editorial quality control)
export const QA_AGENTS = ['copy_editor', 'managing_editor'] as const;

export const PIPELINE_AGENTS = ['researcher', 'writer', 'fact_checker'] as const;

export const ORCHESTRATOR_NAME = 'editor_in_chief' as const;

export const ALL_SUBAGENT_NAMES = [
	'sme',
	'humanizer',
	...QA_AGENTS,
	...PIPELINE_AGENTS,
] as const;

export const ALL_AGENT_NAMES = [
	ORCHESTRATOR_NAME,
	...ALL_SUBAGENT_NAMES,
] as const;

// Type definitions
export type QAAgentName = (typeof QA_AGENTS)[number];
export type PipelineAgentName = (typeof PIPELINE_AGENTS)[number];
export type AgentName = (typeof ALL_AGENT_NAMES)[number];

// Default models for each agent/category
export const DEFAULT_MODELS: Record<string, string> = {
	editor_in_chief: 'anthropic/claude-sonnet-4-5',
	researcher: 'google/gemini-2.0-flash',
	sme: 'google/gemini-2.0-flash',
	writer: 'anthropic/claude-sonnet-4-5',
	copy_editor: 'openai/gpt-4o',
	managing_editor: 'google/gemini-2.0-flash',
	fact_checker: 'google/gemini-2.0-flash',
	humanizer: 'openai/gpt-4o',
	default: 'google/gemini-2.0-flash',
};

// Tool access map — which agents can use which tools
// editor_in_chief is unrestricted (undefined = all tools)
export const AGENT_TOOL_MAP: Partial<Record<AgentName, string[]>> = {
	researcher: [
		'detect_domains',
		'gitingest',
	],
	writer: [
		'extract_code_blocks',
		'retrieve_summary',
	],
	copy_editor: [
		'extract_code_blocks',
		'retrieve_summary',
		'evidence_check',
	],
	managing_editor: [
		'retrieve_summary',
		'evidence_check',
	],
	fact_checker: [
		'detect_domains',
		'retrieve_summary',
		'evidence_check',
	],
	humanizer: [
		'retrieve_summary',
	],
	sme: [
		'detect_domains',
		'retrieve_summary',
	],
};

// Registered tool names — used to validate AGENT_TOOL_MAP at startup
export const TOOL_NAME_SET = new Set<string>([
	'detect_domains',
	'extract_code_blocks',
	'gitingest',
	'save_plan',
	'phase_complete',
	'update_task_status',
	'retrieve_summary',
	'evidence_check',
	'pre_check_batch',
]);

// Models considered low-capability (limited context, fewer instructions followed)
const LOW_CAPABILITY_MODELS = new Set([
	'google/gemini-flash',
	'google/gemini-2.0-flash-lite',
	'openai/gpt-4o-mini',
	'anthropic/claude-haiku-4-5',
]);

// Check if a model ID is considered low-capability
export function isLowCapabilityModel(modelId: string): boolean {
	if (!modelId) return false;
	const lower = modelId.toLowerCase();
	for (const low of LOW_CAPABILITY_MODELS) {
		if (lower.includes(low.toLowerCase().split('/')[1])) return true;
	}
	return false;
}

// Check if agent is in QA category
export function isQAAgent(name: string): name is QAAgentName {
	return (QA_AGENTS as readonly string[]).includes(name);
}

// Check if agent is a subagent
export function isSubagent(name: string): boolean {
	return (ALL_SUBAGENT_NAMES as readonly string[]).includes(name);
}

// Validate that all tools referenced in AGENT_TOOL_MAP are registered
export function validateToolMap(): string[] {
	const errors: string[] = [];
	for (const [agent, tools] of Object.entries(AGENT_TOOL_MAP)) {
		if (!tools) continue;
		for (const tool of tools) {
			if (!TOOL_NAME_SET.has(tool)) {
				errors.push(`Agent "${agent}" references unregistered tool "${tool}"`);
			}
		}
	}
	return errors;
}
