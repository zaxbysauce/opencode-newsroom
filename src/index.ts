import type { Plugin } from '@opencode-ai/plugin';
import { createAgents, getAgentConfigs } from './agents';
import { createNewsroomCommandHandler } from './commands';
import { loadPluginConfig } from './config';
import { GuardrailsConfigSchema } from './config/schema';
import {
	composeHandlers,
	createAgentActivityHooks,
	createCompactionCustomizerHook,
	createContextBudgetHandler,
	createDelegationTrackerHook,
	createGuardrailsHooks,
	createPipelineTrackerHook,
	createSystemEnhancerHook,
	safeHook,
} from './hooks';
import { detect_domains, extract_code_blocks, gitingest } from './tools';
import { log } from './utils';

/**
 * OpenCode Newsroom Plugin
 *
 * Editor-in-Chief-centric editorial pipeline for content production.
 * Hub-and-spoke architecture with:
 * - Editor-in-Chief as central orchestrator
 * - Dynamic SME consultation (serial)
 * - Content production with editorial review
 * - Iterative refinement with triage
 */
const OpenCodeNewsroom: Plugin = async (ctx) => {
	const config = loadPluginConfig(ctx.directory);
	const agents = getAgentConfigs(config);
	const agentDefinitions = createAgents(config);
	const pipelineHook = createPipelineTrackerHook(config);
	const systemEnhancerHook = createSystemEnhancerHook(config, ctx.directory);
	const compactionHook = createCompactionCustomizerHook(config, ctx.directory);
	const contextBudgetHandler = createContextBudgetHandler(config);
	const commandHandler = createNewsroomCommandHandler(
		ctx.directory,
		Object.fromEntries(agentDefinitions.map((agent) => [agent.name, agent])),
	);
	const activityHooks = createAgentActivityHooks(config, ctx.directory);
	const delegationHandler = createDelegationTrackerHook(config);
	const guardrailsConfig = GuardrailsConfigSchema.parse(
		config.guardrails ?? {},
	);
	const guardrailsHooks = createGuardrailsHooks(guardrailsConfig);

	log('Plugin initialized', {
		directory: ctx.directory,
		maxIterations: config.max_iterations,
		agentCount: Object.keys(agents).length,
		agentNames: Object.keys(agents),
		hooks: {
			pipeline: !!pipelineHook['experimental.chat.messages.transform'],
			systemEnhancer:
				!!systemEnhancerHook['experimental.chat.system.transform'],
			compaction: !!compactionHook['experimental.session.compacting'],
			contextBudget: !!contextBudgetHandler,
			commands: true,
			agentActivity: config.hooks?.agent_activity !== false,
			delegationTracker: config.hooks?.delegation_tracker === true,
			guardrails: guardrailsConfig.enabled,
		},
	});

	return {
		name: 'opencode-newsroom',

		// Register all agents
		agent: agents,

		// Register tools
		tool: {
			detect_domains,
			extract_code_blocks,
			gitingest,
		},

		// Configure OpenCode - merge agents into config
		config: async (opencodeConfig: Record<string, unknown>) => {
			// Merge agent configs (don't override default_agent)
			if (!opencodeConfig.agent) {
				opencodeConfig.agent = { ...agents };
			} else {
				Object.assign(opencodeConfig.agent, agents);
			}

			// Register /newsroom command
			opencodeConfig.command = {
				...((opencodeConfig.command as Record<string, unknown>) || {}),
				newsroom: {
					template: '{{arguments}}',
					description: 'Newsroom management commands',
				},
			};

			log('Config applied', {
				agents: Object.keys(agents),
				commands: ['newsroom'],
			});
		},

		// Inject phase reminders before API calls
		'experimental.chat.messages.transform': composeHandlers(
			...[
				pipelineHook['experimental.chat.messages.transform'],
				contextBudgetHandler,
				guardrailsHooks.messagesTransform,
			].filter((fn): fn is NonNullable<typeof fn> => Boolean(fn)),
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		) as any,

		// Inject system prompt enhancements
		'experimental.chat.system.transform': systemEnhancerHook[
			'experimental.chat.system.transform'
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		] as any,

		// Handle session compaction
		'experimental.session.compacting': compactionHook[
			'experimental.session.compacting'
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		] as any,

		// Handle /newsroom commands
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'command.execute.before': safeHook(commandHandler) as any,

		// Track tool usage + guardrails
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'tool.execute.before': (async (input: any, output: any) => {
			// Guardrails runs first WITHOUT safeHook — throws must propagate to block tools
			await guardrailsHooks.toolBefore(input, output);
			// Activity tracking runs second WITH safeHook — errors should not propagate
			await safeHook(activityHooks.toolBefore)(input, output);
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		}) as any,
		'tool.execute.after': composeHandlers(
			activityHooks.toolAfter,
			guardrailsHooks.toolAfter,
			// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		) as any,

		// Track agent delegations and active agent
		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'chat.message': safeHook(delegationHandler) as any,
	};
};

export default OpenCodeNewsroom;

export type { AgentDefinition } from './agents';
// Export types for consumers
export type {
	AgentName,
	PipelineAgentName,
	PluginConfig,
	QAAgentName,
} from './config';
