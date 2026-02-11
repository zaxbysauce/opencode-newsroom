import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import {
	loadAgentPrompt,
	type PluginConfig,
	type NewsroomConfig,
} from '../config';
import { DEFAULT_MODELS } from '../config/constants';
import { type AgentDefinition, createEditorInChiefAgent } from './editor-in-chief';
import { createResearcherAgent } from './researcher';
import { createWriterAgent } from './writer';
import { createCopyEditorAgent } from './copy-editor';
import { createManagingEditorAgent } from './managing-editor';
import { createSMEAgent } from './sme';
import { createFactCheckerAgent } from './fact-checker';
import { createHumanizerAgent } from './humanizer';

export type { AgentDefinition } from './editor-in-chief';

export function stripNewsroomPrefix(
	agentName: string,
	newsroomPrefix?: string,
): string {
	if (!newsroomPrefix || !agentName) return agentName;
	const prefixWithUnderscore = `${newsroomPrefix}_`;
	if (agentName.startsWith(prefixWithUnderscore)) {
		return agentName.substring(prefixWithUnderscore.length);
	}
	return agentName;
}

function getModelForAgent(
	agentName: string,
	newsroomAgents?: Record<string, { model?: string; temperature?: number; disabled?: boolean }>,
	newsroomPrefix?: string,
): string {
	const baseAgentName = stripNewsroomPrefix(agentName, newsroomPrefix);
	const explicit = newsroomAgents?.[baseAgentName]?.model;
	if (explicit) return explicit;
	return DEFAULT_MODELS[baseAgentName] ?? DEFAULT_MODELS.default;
}

function isAgentDisabled(
	agentName: string,
	newsroomAgents?: Record<string, { disabled?: boolean }>,
	newsroomPrefix?: string,
): boolean {
	const baseAgentName = stripNewsroomPrefix(agentName, newsroomPrefix);
	return newsroomAgents?.[baseAgentName]?.disabled === true;
}

function getTemperatureOverride(
	agentName: string,
	newsroomAgents?: Record<string, { temperature?: number }>,
	newsroomPrefix?: string,
): number | undefined {
	const baseAgentName = stripNewsroomPrefix(agentName, newsroomPrefix);
	return newsroomAgents?.[baseAgentName]?.temperature;
}

function applyOverrides(
	agent: AgentDefinition,
	newsroomAgents?: Record<string, { temperature?: number }>,
	newsroomPrefix?: string,
): AgentDefinition {
	const tempOverride = getTemperatureOverride(agent.name, newsroomAgents, newsroomPrefix);
	if (tempOverride !== undefined) {
		agent.config.temperature = tempOverride;
	}
	return agent;
}

function createNewsroomAgents(
	newsroomId: string,
	newsroomConfig: NewsroomConfig,
	isDefault: boolean,
	pluginConfig?: PluginConfig,
): AgentDefinition[] {
	const agents: AgentDefinition[] = [];
	const newsroomAgents = newsroomConfig.agents;
	const prefix = isDefault ? '' : `${newsroomId}_`;
	const newsroomPrefix = isDefault ? undefined : newsroomId;
	const qaRetryLimit = pluginConfig?.qa_retry_limit ?? 3;
	const getModel = (baseName: string) => getModelForAgent(baseName, newsroomAgents, newsroomPrefix);
	const getPrompts = (name: string) => loadAgentPrompt(name);
	const prefixName = (name: string) => `${prefix}${name}`;

	// 1. Create Editor-in-Chief
	if (!isAgentDisabled('editor_in_chief', newsroomAgents, newsroomPrefix)) {
		const editorInChiefPrompts = getPrompts('editor_in_chief');
		const editorInChief = createEditorInChiefAgent(getModel('editor_in_chief'), editorInChiefPrompts.prompt, editorInChiefPrompts.appendPrompt);
		editorInChief.name = prefixName('editor_in_chief');
		const newsroomName = newsroomConfig.name || newsroomId;
		const newsroomIdentity = isDefault ? 'default' : newsroomId;
		const agentPrefix = prefix;
		editorInChief.config.prompt = editorInChief.config.prompt
			?.replace(/\{\{NEWSROOM_ID\}\}/g, newsroomIdentity)
			.replace(/\{\{AGENT_PREFIX\}\}/g, agentPrefix)
			.replace(/\{\{QA_RETRY_LIMIT\}\}/g, String(qaRetryLimit));
		if (!isDefault) {
			editorInChief.description = `[${newsroomName}] ${editorInChief.description}`;
			const newsroomHeader = `## ⚠️ YOU ARE THE ${newsroomName.toUpperCase()} NEWSROOM EDITOR-IN-CHIEF\n\nYour newsroom ID is "${newsroomId}". ALL your agents have the "${newsroomId}_" prefix:\n- @${newsroomId}_researcher (not @researcher)\n- @${newsroomId}_writer (not @writer)\n- @${newsroomId}_sme (not @sme)\n- @${newsroomId}_copy_editor (not @copy_editor)\n- etc.\n\nCRITICAL: Agents without the "${newsroomId}_" prefix DO NOT EXIST or belong to a DIFFERENT newsroom.\nIf you call @writer instead of @${newsroomId}_writer, the call will FAIL or go to the wrong newsroom.\n\n`;
			editorInChief.config.prompt = newsroomHeader + editorInChief.config.prompt;
		}
		agents.push(applyOverrides(editorInChief, newsroomAgents, newsroomPrefix));
	}

	// 2. Create Researcher
	if (!isAgentDisabled('researcher', newsroomAgents, newsroomPrefix)) {
		const researcherPrompts = getPrompts('researcher');
		const researcher = createResearcherAgent(getModel('researcher'), researcherPrompts.prompt, researcherPrompts.appendPrompt);
		researcher.name = prefixName('researcher');
		agents.push(applyOverrides(researcher, newsroomAgents, newsroomPrefix));
	}

	// 3. Create SME
	if (!isAgentDisabled('sme', newsroomAgents, newsroomPrefix)) {
		const smePrompts = getPrompts('sme');
		const sme = createSMEAgent(getModel('sme'), smePrompts.prompt, smePrompts.appendPrompt);
		sme.name = prefixName('sme');
		agents.push(applyOverrides(sme, newsroomAgents, newsroomPrefix));
	}

	// 4. Create Writer
	if (!isAgentDisabled('writer', newsroomAgents, newsroomPrefix)) {
		const writerPrompts = getPrompts('writer');
		const writer = createWriterAgent(getModel('writer'), writerPrompts.prompt, writerPrompts.appendPrompt);
		writer.name = prefixName('writer');
		agents.push(applyOverrides(writer, newsroomAgents, newsroomPrefix));
	}

	// 5. Create Copy Editor
	if (!isAgentDisabled('copy_editor', newsroomAgents, newsroomPrefix)) {
		const copyEditorPrompts = getPrompts('copy_editor');
		const copyEditor = createCopyEditorAgent(getModel('copy_editor'), copyEditorPrompts.prompt, copyEditorPrompts.appendPrompt);
		copyEditor.name = prefixName('copy_editor');
		agents.push(applyOverrides(copyEditor, newsroomAgents, newsroomPrefix));
	}

	// 6. Create Managing Editor
	if (!isAgentDisabled('managing_editor', newsroomAgents, newsroomPrefix)) {
		const managingEditorPrompts = getPrompts('managing_editor');
		const managingEditor = createManagingEditorAgent(getModel('managing_editor'), managingEditorPrompts.prompt, managingEditorPrompts.appendPrompt);
		managingEditor.name = prefixName('managing_editor');
		agents.push(applyOverrides(managingEditor, newsroomAgents, newsroomPrefix));
	}

	// 7. Create Fact Checker
	if (!isAgentDisabled('fact_checker', newsroomAgents, newsroomPrefix)) {
		const factCheckerPrompts = getPrompts('fact_checker');
		const factChecker = createFactCheckerAgent(getModel('fact_checker'), factCheckerPrompts.prompt, factCheckerPrompts.appendPrompt);
		factChecker.name = prefixName('fact_checker');
		agents.push(applyOverrides(factChecker, newsroomAgents, newsroomPrefix));
	}

	// 8. Create Humanizer
	if (!isAgentDisabled('humanizer', newsroomAgents, newsroomPrefix)) {
		const humanizerPrompts = getPrompts('humanizer');
		const humanizer = createHumanizerAgent(getModel('humanizer'), humanizerPrompts.prompt, humanizerPrompts.appendPrompt);
		humanizer.name = prefixName('humanizer');
		agents.push(applyOverrides(humanizer, newsroomAgents, newsroomPrefix));
	}

	return agents;
}

export function createAgents(config?: PluginConfig): AgentDefinition[] {
	const allAgents: AgentDefinition[] = [];

	// Check if we have newsrooms configured
	const newsrooms = config?.newsrooms;

	if (newsrooms && Object.keys(newsrooms).length > 0) {
		// Multiple newsrooms mode
		// Only a newsroom explicitly named "default" gets unprefixed agents
		// All other newsrooms get prefixed (local_*, etc.)
		for (const newsroomId of Object.keys(newsrooms)) {
			const newsroomConfig = newsrooms[newsroomId];
			const isDefault = newsroomId === 'default';
			const agents = createNewsroomAgents(
				newsroomId,
				newsroomConfig,
				isDefault,
				config,
			);
			allAgents.push(...agents);
		}
	} else {
		// Legacy single newsroom mode - use top-level agents config
		const legacyNewsroomConfig: NewsroomConfig = {
			name: 'Default',
			agents: config?.agents,
		};
		const agents = createNewsroomAgents(
			'default',
			legacyNewsroomConfig,
			true,
			config,
		);
		allAgents.push(...agents);
	}

	return allAgents;
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 */
export function getAgentConfigs(
	config?: PluginConfig,
): Record<string, SDKAgentConfig> {
	const agents = createAgents(config);

	return Object.fromEntries(
		agents.map((agent) => {
			const sdkConfig: SDKAgentConfig = {
				...agent.config,
				description: agent.description,
			};

			// Apply mode based on agent type
			// Editor-in-Chief is primary, everything else is subagent
			if (agent.name === 'editor_in_chief' || agent.name.endsWith('_editor_in_chief')) {
				sdkConfig.mode = 'primary';
			} else {
				sdkConfig.mode = 'subagent';
			}

			return [agent.name, sdkConfig];
		}),
	);
}

// Re-exports
export {
	createEditorInChiefAgent,
	createResearcherAgent,
	createSMEAgent,
	createWriterAgent,
	createCopyEditorAgent,
	createManagingEditorAgent,
	createFactCheckerAgent,
	createHumanizerAgent,
};
