import {
	createEditorInChiefAgent,
	createResearcherAgent,
	createSMEAgent,
	createWriterAgent,
	createCopyEditorAgent,
	createManagingEditorAgent,
	createFactCheckerAgent,
	createHumanizerAgent,
} from "../../../src/agents/index";
import { describe, expect, test } from "bun:test";

describe("Agent Factory Functions", () => {
	test("createEditorInChiefAgent returns correct structure", () => {
		const agent = createEditorInChiefAgent("gpt-4");

		expect(agent.name).toBe("editor_in_chief");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.3);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toContain("editorial coordinator");
	});

	test("createResearcherAgent returns correct structure", () => {
		const agent = createResearcherAgent("gpt-4");

		expect(agent.name).toBe("researcher");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.2);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toContain("research");
	});

	test("createSMEAgent returns correct structure", () => {
		const agent = createSMEAgent("gpt-4");

		expect(agent.name).toBe("sme");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.3);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toContain("expert");
	});

	test("createWriterAgent returns correct structure", () => {
		const agent = createWriterAgent("gpt-4");

		expect(agent.name).toBe("writer");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.7);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toContain("prose");
		expect(agent.config.tools.write).toBe(false);
		expect(agent.config.tools.edit).toBe(false);
		expect(agent.config.tools.patch).toBe(false);
	});

	test("createCopyEditorAgent returns correct structure", () => {
		const agent = createCopyEditorAgent("gpt-4");

		expect(agent.name).toBe("copy_editor");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.2);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toMatch(/prose|style|grammar/i);
	});

	test("createManagingEditorAgent returns correct structure", () => {
		const agent = createManagingEditorAgent("gpt-4");

		expect(agent.name).toBe("managing_editor");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.2);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toMatch(/plan|editorial/i);
	});

	test("createFactCheckerAgent returns correct structure", () => {
		const agent = createFactCheckerAgent("gpt-4");

		expect(agent.name).toBe("fact_checker");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.1);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toMatch(/fact|verif/);
	});

	test("createHumanizerAgent returns correct structure", () => {
		const agent = createHumanizerAgent("gpt-4");

		expect(agent.name).toBe("humanizer");
		expect(agent.config.model).toBe("gpt-4");
		expect(agent.config.temperature).toBe(0.2);
		expect(typeof agent.config.prompt).toBe("string");
		expect(agent.config.prompt.length).toBeGreaterThan(0);
		expect(agent.description).toMatch(/AI|human/i);
	});

	test("createEditorInChiefAgent accepts customPrompt override", () => {
		const customPrompt = "This is a custom prompt";
		const agent = createEditorInChiefAgent("gpt-4", customPrompt);

		expect(agent.config.prompt).toBe(customPrompt);
	});

	test("createResearcherAgent accepts customPrompt override", () => {
		const customPrompt = "This is a custom prompt";
		const agent = createResearcherAgent("gpt-4", customPrompt);

		expect(agent.config.prompt).toBe(customPrompt);
	});

	test("createWriterAgent accepts customAppendPrompt", () => {
		const appendPrompt = "\n\nCustom appended content";
		const agent = createWriterAgent("gpt-4", undefined, appendPrompt);

		expect(agent.config.prompt).toContain("Custom appended content");
		expect(agent.config.prompt).toContain("You are a professional staff writer");
	});

	test("createWriterAgent tools are correctly restricted", () => {
		const agent = createWriterAgent("gpt-4");

		expect(agent.config.tools.write).toBe(false);
		expect(agent.config.tools.edit).toBe(false);
		expect(agent.config.tools.patch).toBe(false);
		expect(agent.config.tools).toHaveProperty("write");
		expect(agent.config.tools).toHaveProperty("edit");
		expect(agent.config.tools).toHaveProperty("patch");
	});
});
