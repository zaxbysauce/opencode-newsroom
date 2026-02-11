import { describe, expect, test } from "bun:test";
import { stripNewsroomPrefix, createAgents, getAgentConfigs } from "../../../src/agents/index";

describe("stripNewsroomPrefix", () => {
	test("no prefix returns name unchanged", () => {
		expect(stripNewsroomPrefix("writer")).toBe("writer");
	});

	test("with prefix strips it", () => {
		expect(stripNewsroomPrefix("local_writer", "local")).toBe("writer");
		expect(stripNewsroomPrefix("my_editor_in_chief", "my")).toBe("editor_in_chief");
	});

	test("name without matching prefix unchanged", () => {
		expect(stripNewsroomPrefix("researcher", "local")).toBe("researcher");
		expect(stripNewsroomPrefix("writer", "custom")).toBe("writer");
	});

	test("empty string returns empty", () => {
		expect(stripNewsroomPrefix("")).toBe("");
		expect(stripNewsroomPrefix("writer", "")).toBe("writer");
	});

	test("no agent name returns empty", () => {
		expect(stripNewsroomPrefix("")).toBe("");
		expect(stripNewsroomPrefix("", "local")).toBe("");
	});

	test("undefined prefix returns name unchanged", () => {
		expect(stripNewsroomPrefix("writer", undefined)).toBe("writer");
	});
});

describe("createAgents", () => {
	test("no config returns 8 agents", () => {
		const agents = createAgents();
		expect(agents).toHaveLength(8);
	});

	test("agent names include all 8 expected names", () => {
		const agents = createAgents();
		const agentNames = agents.map((a) => a.name);

		expect(agentNames).toContain("editor_in_chief");
		expect(agentNames).toContain("researcher");
		expect(agentNames).toContain("sme");
		expect(agentNames).toContain("writer");
		expect(agentNames).toContain("copy_editor");
		expect(agentNames).toContain("managing_editor");
		expect(agentNames).toContain("fact_checker");
		expect(agentNames).toContain("humanizer");
	});

	test("all agents have a prompt string", () => {
		const agents = createAgents();
		agents.forEach((agent) => {
			expect(agent.config.prompt).toBeDefined();
			expect(typeof agent.config.prompt).toBe("string");
			expect(agent.config.prompt.length).toBeGreaterThan(0);
		});
	});

	test("all agents have a name string", () => {
		const agents = createAgents();
		agents.forEach((agent) => {
			expect(agent.name).toBeDefined();
			expect(typeof agent.name).toBe("string");
			expect(agent.name.length).toBeGreaterThan(0);
		});
	});

	test("all agents have a description string", () => {
		const agents = createAgents();
		agents.forEach((agent) => {
			expect(agent.description).toBeDefined();
			expect(typeof agent.description).toBe("string");
			expect(agent.description.length).toBeGreaterThan(0);
		});
	});
});

describe("getAgentConfigs", () => {
	test("no config returns 8 entries", () => {
		const configs = getAgentConfigs();
		expect(Object.keys(configs)).toHaveLength(8);
	});

	test("editor_in_chief has mode 'primary'", () => {
		const configs = getAgentConfigs();
		expect(configs.editor_in_chief?.mode).toBe("primary");
	});

	test("writer has mode 'subagent'", () => {
		const configs = getAgentConfigs();
		expect(configs.writer?.mode).toBe("subagent");
	});

	test("all agents have a mode property", () => {
		const configs = getAgentConfigs();
		Object.keys(configs).forEach((agentName) => {
			expect(configs[agentName]?.mode).toBeDefined();
			expect(typeof configs[agentName]?.mode).toBe("string");
		});
	});

	test("editor_in_chief mode is 'primary'", () => {
		const configs = getAgentConfigs();
		expect(configs.editor_in_chief?.mode).toBe("primary");
	});

	test("all other agents have mode 'subagent'", () => {
		const configs = getAgentConfigs();
		const otherAgents = ["researcher", "sme", "writer", "copy_editor", "managing_editor", "fact_checker", "humanizer"];

		otherAgents.forEach((agentName) => {
			expect(configs[agentName]?.mode).toBe("subagent");
		});
	});

	test("configs are records keyed by agent name", () => {
		const configs = getAgentConfigs();
		expect(typeof configs).toBe("object");
		expect(configs.editor_in_chief).toBeDefined();
		expect(configs.researcher).toBeDefined();
		expect(configs.sme).toBeDefined();
		expect(configs.writer).toBeDefined();
		expect(configs.copy_editor).toBeDefined();
		expect(configs.managing_editor).toBeDefined();
		expect(configs.fact_checker).toBeDefined();
		expect(configs.humanizer).toBeDefined();
	});
});
