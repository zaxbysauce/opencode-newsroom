import { z } from 'zod';
import { ALL_AGENT_NAMES, ORCHESTRATOR_NAME } from './constants';

// Agent override configuration
export const AgentOverrideConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	disabled: z.boolean().optional(),
});

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

// Newsroom configuration (a complete set of agent overrides)
export const NewsroomConfigSchema = z.object({
	name: z.string().optional(),
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),
});

export type NewsroomConfig = z.infer<typeof NewsroomConfigSchema>;

// Hook feature flags
export const HooksConfigSchema = z.object({
	system_enhancer: z.boolean().default(true),
	compaction: z.boolean().default(true),
	agent_activity: z.boolean().default(true),
	delegation_tracker: z.boolean().default(false),
	agent_awareness_max_chars: z.number().min(50).max(2000).default(300),
});

export type HooksConfig = z.infer<typeof HooksConfigSchema>;

// Context budget configuration
export const ContextBudgetConfigSchema = z.object({
	enabled: z.boolean().default(true),
	warn_threshold: z.number().min(0).max(1).default(0.7),
	critical_threshold: z.number().min(0).max(1).default(0.9),
	model_limits: z
		.record(z.string(), z.number().min(1000))
		.default({ default: 128000 }),
	max_injection_tokens: z.number().min(100).max(50000).default(4000),
});

export type ContextBudgetConfig = z.infer<typeof ContextBudgetConfigSchema>;

// Evidence retention configuration
export const EvidenceConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_age_days: z.number().min(1).max(365).default(90),
	max_bundles: z.number().min(10).max(10000).default(1000),
	auto_archive: z.boolean().default(false),
});

export type EvidenceConfig = z.infer<typeof EvidenceConfigSchema>;

// Guardrails profile (per-agent overrides - all fields optional)
export const GuardrailsProfileSchema = z.object({
	max_tool_calls: z.number().min(10).max(1000).optional(),
	max_duration_minutes: z.number().min(1).max(120).optional(),
	max_repetitions: z.number().min(3).max(50).optional(),
	max_consecutive_errors: z.number().min(2).max(20).optional(),
	warning_threshold: z.number().min(0.1).max(0.9).optional(),
});

export type GuardrailsProfile = z.infer<typeof GuardrailsProfileSchema>;

export const DEFAULT_EDITOR_IN_CHIEF_PROFILE: GuardrailsProfile = {
	max_tool_calls: 600,
	max_duration_minutes: 90,
	max_consecutive_errors: 8,
	warning_threshold: 0.7,
};

// Guardrails configuration
export const GuardrailsConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_tool_calls: z.number().min(10).max(1000).default(200),
	max_duration_minutes: z.number().min(1).max(120).default(30),
	max_repetitions: z.number().min(3).max(50).default(10),
	max_consecutive_errors: z.number().min(2).max(20).default(5),
	warning_threshold: z.number().min(0.1).max(0.9).default(0.5),
	profiles: z.record(z.string(), GuardrailsProfileSchema).optional(),
});

export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;

export function stripKnownNewsroomPrefix(name: string): string {
	if (!name) return name;
	if ((ALL_AGENT_NAMES as readonly string[]).includes(name)) return name;
	for (const agentName of ALL_AGENT_NAMES) {
		const suffix = `_${agentName}`;
		if (name.endsWith(suffix)) {
			return agentName;
		}
	}
	return name;
}

export function resolveGuardrailsConfig(
	base: GuardrailsConfig,
	agentName?: string,
): GuardrailsConfig {
	if (!agentName) {
		return base;
	}

	const baseName = stripKnownNewsroomPrefix(agentName);

	const builtIn =
		baseName === ORCHESTRATOR_NAME ? DEFAULT_EDITOR_IN_CHIEF_PROFILE : undefined;

	const userProfile = base.profiles?.[baseName] ?? base.profiles?.[agentName];

	if (!builtIn && !userProfile) {
		return base;
	}

	return { ...base, ...builtIn, ...userProfile };
}

// Main plugin configuration
export const PluginConfigSchema = z.object({
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),

	newsrooms: z.record(z.string(), NewsroomConfigSchema).optional(),

	max_iterations: z.number().min(1).max(10).default(5),

	qa_retry_limit: z.number().min(1).max(10).default(3),

	inject_phase_reminders: z.boolean().default(true),

	hooks: HooksConfigSchema.optional(),

	context_budget: ContextBudgetConfigSchema.optional(),

	guardrails: GuardrailsConfigSchema.optional(),

	evidence: EvidenceConfigSchema.optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Re-export types from constants
export type {
	AgentName,
	PipelineAgentName,
	QAAgentName,
} from './constants';


