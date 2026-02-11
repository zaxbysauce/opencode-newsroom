import type { PluginConfig } from './schema';

export const DEFAULT_CONFIG: PluginConfig = {
	agents: {
		editor_in_chief: { model: 'anthropic/claude-sonnet-4-5' },
		researcher: { model: 'google/gemini-2.0-flash' },
		sme: { model: 'google/gemini-2.0-flash' },
		writer: { model: 'anthropic/claude-sonnet-4-5' },
		copy_editor: { model: 'openai/gpt-4o' },
		managing_editor: { model: 'google/gemini-2.0-flash' },
		fact_checker: { model: 'google/gemini-2.0-flash' },
		humanizer: { model: 'openai/gpt-4o' },
	},
	max_iterations: 5,
	qa_retry_limit: 3,
	inject_phase_reminders: true,
	guardrails: {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.5,
		profiles: {
			editor_in_chief: {
				max_tool_calls: 600,
				max_duration_minutes: 90,
				max_consecutive_errors: 8,
				warning_threshold: 0.7,
			},
		},
	},
};
