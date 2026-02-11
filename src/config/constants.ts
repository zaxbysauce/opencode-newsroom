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

// Check if agent is in QA category
export function isQAAgent(name: string): name is QAAgentName {
	return (QA_AGENTS as readonly string[]).includes(name);
}

// Check if agent is a subagent
export function isSubagent(name: string): boolean {
	return (ALL_SUBAGENT_NAMES as readonly string[]).includes(name);
}
