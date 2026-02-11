import { describe, expect, test } from "bun:test";

import {
	AgentOverrideConfigSchema,
	NewsroomConfigSchema,
	PluginConfigSchema,
	stripKnownNewsroomPrefix,
	DEFAULT_EDITOR_IN_CHIEF_PROFILE,
	resolveGuardrailsConfig,
} from "../../../src/config/schema";

describe("schema", () => {
	describe("AgentOverrideConfigSchema", () => {
		test("validates with all optional fields", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				model: "gpt-4",
				temperature: 1.5,
				disabled: true,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.model).toBe("gpt-4");
				expect(result.data.temperature).toBe(1.5);
				expect(result.data.disabled).toBe(true);
			}
		});

		test("validates empty object", () => {
			const result = AgentOverrideConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.model).toBeUndefined();
				expect(result.data.temperature).toBeUndefined();
				expect(result.data.disabled).toBeUndefined();
			}
		});

		test("validates temperature is number between 0 and 2", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				temperature: 0.7,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.temperature).toBe(0.7);
			}
		});

		test("rejects invalid temperature (e.g., 3)", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				temperature: 3,
			});
			expect(result.success).toBe(false);
		});

		test("rejects invalid temperature (e.g., -0.1)", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				temperature: -0.1,
			});
			expect(result.success).toBe(false);
		});

		test("rejects invalid temperature (e.g., 2.1)", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				temperature: 2.1,
			});
			expect(result.success).toBe(false);
		});

		test("validates model is string", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				model: "gpt-4",
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.model).toBe("gpt-4");
			}
		});

		test("validates disabled is boolean", () => {
			const result = AgentOverrideConfigSchema.safeParse({
				disabled: false,
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.disabled).toBe(false);
			}
		});
	});

	describe("NewsroomConfigSchema", () => {
		test("validates with name and agents", () => {
			const result = NewsroomConfigSchema.safeParse({
				name: "My Newsroom",
				agents: {
					editor_in_chief: {
						model: "gpt-4",
						temperature: 0.7,
					},
				},
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("My Newsroom");
				expect(result.data.agents?.editor_in_chief?.model).toBe("gpt-4");
				expect(result.data.agents?.editor_in_chief?.temperature).toBe(0.7);
			}
		});

		test("validates empty object", () => {
			const result = NewsroomConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBeUndefined();
				expect(result.data.agents).toBeUndefined();
			}
		});

		test("validates agents as record of AgentOverrideConfigSchema", () => {
			const result = NewsroomConfigSchema.safeParse({
				agents: {
					editor_in_chief: {
						temperature: 0.8,
					},
					writer: {
						model: "gpt-3.5-turbo",
					},
				},
			});
			expect(result.success).toBe(true);
		});
	});

	describe("PluginConfigSchema", () => {
		test("validates empty object gets defaults", () => {
			const result = PluginConfigSchema.safeParse({});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.max_iterations).toBe(5);
				expect(result.data.qa_retry_limit).toBe(3);
				expect(result.data.inject_phase_reminders).toBe(true);
				expect(result.data.agents).toBeUndefined();
			}
		});

		test("validates with agents", () => {
			const result = PluginConfigSchema.safeParse({
				agents: {
					editor_in_chief: {
						model: "gpt-4",
						temperature: 0.7,
					},
					writer: {
						disabled: true,
					},
				},
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.agents?.editor_in_chief?.model).toBe("gpt-4");
				expect(result.data.agents?.editor_in_chief?.temperature).toBe(0.7);
				expect(result.data.agents?.writer?.disabled).toBe(true);
			}
		});

		test("validates all optional fields can be set", () => {
			const result = PluginConfigSchema.safeParse({
				max_iterations: 10,
				qa_retry_limit: 5,
				inject_phase_reminders: false,
				agents: {
					editor_in_chief: {
						model: "gpt-4",
					},
				},
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.max_iterations).toBe(10);
				expect(result.data.qa_retry_limit).toBe(5);
				expect(result.data.inject_phase_reminders).toBe(false);
				expect(result.data.agents?.editor_in_chief?.model).toBe("gpt-4");
			}
		});

		test("rejects max_iterations less than 1", () => {
			const result = PluginConfigSchema.safeParse({ max_iterations: 0 });
			expect(result.success).toBe(false);
		});

		test("rejects max_iterations greater than 10", () => {
			const result = PluginConfigSchema.safeParse({ max_iterations: 11 });
			expect(result.success).toBe(false);
		});

		test("rejects qa_retry_limit less than 1", () => {
			const result = PluginConfigSchema.safeParse({ qa_retry_limit: 0 });
			expect(result.success).toBe(false);
		});

		test("rejects qa_retry_limit greater than 10", () => {
			const result = PluginConfigSchema.safeParse({ qa_retry_limit: 11 });
			expect(result.success).toBe(false);
		});
	});

	describe("stripKnownNewsroomPrefix function", () => {
		test("returns known agent name unchanged", () => {
			expect(stripKnownNewsroomPrefix("writer")).toBe("writer");
			expect(stripKnownNewsroomPrefix("editor_in_chief")).toBe("editor_in_chief");
			expect(stripKnownNewsroomPrefix("researcher")).toBe("researcher");
		});

		test("strips prefix from agent name", () => {
			expect(stripKnownNewsroomPrefix("foo_writer")).toBe("writer");
			expect(stripKnownNewsroomPrefix("test_editor_in_chief")).toBe("editor_in_chief");
			expect(stripKnownNewsroomPrefix("project_researcher")).toBe("researcher");
		});

		test("returns unknown name unchanged", () => {
			expect(stripKnownNewsroomPrefix("unknown")).toBe("unknown");
			expect(stripKnownNewsroomPrefix("custom_agent")).toBe("custom_agent");
			expect(stripKnownNewsroomPrefix("my_agent_name")).toBe("my_agent_name");
		});

		test("handles empty string", () => {
			expect(stripKnownNewsroomPrefix("")).toBe("");
		});
	});

	describe("DEFAULT_EDITOR_IN_CHIEF_PROFILE constant", () => {
		test("has correct values", () => {
			expect(DEFAULT_EDITOR_IN_CHIEF_PROFILE).toEqual({
				max_tool_calls: 600,
				max_duration_minutes: 90,
				max_consecutive_errors: 8,
				warning_threshold: 0.7,
			});
		});

		test("all fields are numbers", () => {
			expect(typeof DEFAULT_EDITOR_IN_CHIEF_PROFILE.max_tool_calls).toBe("number");
			expect(typeof DEFAULT_EDITOR_IN_CHIEF_PROFILE.max_duration_minutes).toBe("number");
			expect(typeof DEFAULT_EDITOR_IN_CHIEF_PROFILE.max_consecutive_errors).toBe("number");
			expect(typeof DEFAULT_EDITOR_IN_CHIEF_PROFILE.warning_threshold).toBe("number");
		});

		test("warning_threshold is between 0.1 and 0.9", () => {
			expect(DEFAULT_EDITOR_IN_CHIEF_PROFILE.warning_threshold).toBeGreaterThanOrEqual(0.1);
			expect(DEFAULT_EDITOR_IN_CHIEF_PROFILE.warning_threshold).toBeLessThanOrEqual(0.9);
		});
	});

	describe("resolveGuardrailsConfig function", () => {
		test("returns base config if no agent specified", () => {
			const base = {
				enabled: true,
				max_tool_calls: 200,
			};
			const result = resolveGuardrailsConfig(base);
			expect(result).toEqual(base);
		});

		test("merges base with built-in editor_in_chief profile", () => {
			const base = {
				enabled: true,
				max_tool_calls: 200,
				max_duration_minutes: 30,
			};
			const result = resolveGuardrailsConfig(base, "editor_in_chief");
			expect(result.enabled).toBe(true);
			expect(result.max_tool_calls).toBe(600); // Built-in overrides
			expect(result.max_duration_minutes).toBe(90); // Built-in overrides
		});

		test("returns base if agent has no built-in profile", () => {
			const base = {
				enabled: true,
				max_tool_calls: 200,
			};
			const result = resolveGuardrailsConfig(base, "unknown_agent");
			expect(result).toEqual(base);
		});

		test("handles empty base config", () => {
			const result = resolveGuardrailsConfig({});
			expect(result).toEqual({});
		});
	});
});
