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
	/** Enable scoring-based context injection (system-enhancer Path B) */
	scoring_injection: z.boolean().default(false),
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
	/** Enable two-stage message reduction (mask tool outputs → remove low-priority messages) */
	reduction_enabled: z.boolean().default(true),
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
	/** Max identical calls before warning (loop detection) */
	loop_warning_threshold: z.number().min(2).max(20).optional(),
	/** Max identical calls before hard block (loop detection) */
	loop_block_threshold: z.number().min(3).max(30).optional(),
});

export type GuardrailsProfile = z.infer<typeof GuardrailsProfileSchema>;

export const DEFAULT_EDITOR_IN_CHIEF_PROFILE: GuardrailsProfile = {
	max_tool_calls: 600,
	max_duration_minutes: 90,
	max_consecutive_errors: 8,
	warning_threshold: 0.7,
	loop_warning_threshold: 3,
	loop_block_threshold: 5,
};

// Guardrails configuration
export const GuardrailsConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_tool_calls: z.number().min(10).max(1000).default(200),
	max_duration_minutes: z.number().min(1).max(120).default(30),
	max_repetitions: z.number().min(3).max(50).default(10),
	max_consecutive_errors: z.number().min(2).max(20).default(5),
	warning_threshold: z.number().min(0.1).max(0.9).default(0.5),
	/** Max identical consecutive calls before warning (default: 3) */
	loop_warning_threshold: z.number().min(2).max(20).default(3),
	/** Max identical consecutive calls before hard block (default: 5) */
	loop_block_threshold: z.number().min(3).max(30).default(5),
	/** Prevent editor-in-chief from writing content directly (must delegate to writer) */
	prevent_self_writing: z.boolean().default(true),
	/** Enforce QA delegation — prevent skipping copy_editor/managing_editor */
	enforce_qa_delegation: z.boolean().default(true),
	profiles: z.record(z.string(), GuardrailsProfileSchema).optional(),
});

export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;

// Knowledge system configuration
export const KnowledgeConfigSchema = z.object({
	enabled: z.boolean().default(true),
	/** Max entries to retain in knowledge.jsonl */
	max_entries: z.number().min(10).max(10000).default(500),
	/** Minimum confidence to auto-promote an entry */
	auto_promote_threshold: z.number().min(0).max(1).default(0.85),
	/** Whether to include knowledge in system prompt injection */
	inject_into_context: z.boolean().default(false),
	/** Max chars of knowledge to inject per session */
	max_inject_chars: z.number().min(100).max(5000).default(1000),
});

export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;

// Summary retention configuration
export const SummaryConfigSchema = z.object({
	enabled: z.boolean().default(true),
	/** Character threshold before a tool output is summarized */
	threshold_chars: z.number().min(500).max(50000).default(2000),
	/** Max summaries to retain */
	max_summaries: z.number().min(10).max(1000).default(100),
});

export type SummaryConfig = z.infer<typeof SummaryConfigSchema>;

// Automation mode configuration
export const AutomationConfigSchema = z.object({
	/** manual: editor-in-chief always waits for explicit approval
	 *  hybrid: auto-approves low-risk tasks (research, outline), waits for write/review
	 *  auto: fully automated pipeline with guardrails only */
	mode: z.enum(['manual', 'hybrid', 'auto']).default('hybrid'),
	/** In hybrid mode: automatically approve research and outline phases */
	auto_approve_research: z.boolean().default(true),
	/** In hybrid/auto mode: require human approval before publishing */
	require_publish_approval: z.boolean().default(true),
});

export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;

// Editorial quality gates
export const QualityGatesConfigSchema = z.object({
	enabled: z.boolean().default(true),
	/** Require copy_editor review before marking a section complete */
	require_copy_edit: z.boolean().default(true),
	/** Require fact_checker review for claims with sources */
	require_fact_check: z.boolean().default(true),
	/** Require humanizer review before final output */
	require_humanizer: z.boolean().default(false),
	/** Maximum allowed AI-detection confidence (0 = not enforced) */
	max_ai_detection_score: z.number().min(0).max(1).default(0),
	/** Minimum fact density (verifiable claims per 100 words, 0 = not enforced) */
	min_fact_density: z.number().min(0).max(10).default(0),
});

export type QualityGatesConfig = z.infer<typeof QualityGatesConfigSchema>;

// Scoring configuration for context injection (system-enhancer Path B)
export const ScoringConfigSchema = z.object({
	enabled: z.boolean().default(false),
	/** Weight for recency (0–1) */
	recency_weight: z.number().min(0).max(1).default(0.4),
	/** Weight for relevance to current phase (0–1) */
	phase_relevance_weight: z.number().min(0).max(1).default(0.4),
	/** Weight for agent-specific context (0–1) */
	agent_weight: z.number().min(0).max(1).default(0.2),
});

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

// Tool filtering — per-agent role-scoped access control
export const ToolFilteringConfigSchema = z.object({
	enabled: z.boolean().default(false),
	/** Deny list of tools that subagents cannot use (editor_in_chief is exempt) */
	subagent_denied_tools: z.array(z.string()).default([]),
	/** Per-agent tool allow lists (overrides deny list) */
	agent_allowed_tools: z.record(z.string(), z.array(z.string())).optional(),
});

export type ToolFilteringConfig = z.infer<typeof ToolFilteringConfigSchema>;

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

	knowledge: KnowledgeConfigSchema.optional(),

	summaries: SummaryConfigSchema.optional(),

	automation: AutomationConfigSchema.optional(),

	quality_gates: QualityGatesConfigSchema.optional(),

	scoring: ScoringConfigSchema.optional(),

	tool_filtering: ToolFilteringConfigSchema.optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Re-export types from constants
export type {
	AgentName,
	PipelineAgentName,
	QAAgentName,
} from './constants';
