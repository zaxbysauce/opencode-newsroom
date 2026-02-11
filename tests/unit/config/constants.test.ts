import { describe, expect, test } from "bun:test";

import { ALL_AGENT_NAMES, ALL_SUBAGENT_NAMES, ORCHESTRATOR_NAME, QA_AGENTS, PIPELINE_AGENTS, isQAAgent, isSubagent } from "../../../src/config/constants";

describe("constants", () => {
  test("ALL_AGENT_NAMES includes all 8 agents", () => {
    expect(ALL_AGENT_NAMES).toContain("editor_in_chief");
    expect(ALL_AGENT_NAMES).toContain("sme");
    expect(ALL_AGENT_NAMES).toContain("humanizer");
    expect(ALL_AGENT_NAMES).toContain("copy_editor");
    expect(ALL_AGENT_NAMES).toContain("managing_editor");
    expect(ALL_AGENT_NAMES).toContain("researcher");
    expect(ALL_AGENT_NAMES).toContain("writer");
    expect(ALL_AGENT_NAMES).toContain("fact_checker");
  });

  test("ALL_SUBAGENT_NAMES includes 7 subagents (no editor_in_chief)", () => {
    expect(ALL_SUBAGENT_NAMES).toContain("sme");
    expect(ALL_SUBAGENT_NAMES).toContain("humanizer");
    expect(ALL_SUBAGENT_NAMES).toContain("copy_editor");
    expect(ALL_SUBAGENT_NAMES).toContain("managing_editor");
    expect(ALL_SUBAGENT_NAMES).toContain("researcher");
    expect(ALL_SUBAGENT_NAMES).toContain("writer");
    expect(ALL_SUBAGENT_NAMES).toContain("fact_checker");
    expect(ALL_SUBAGENT_NAMES).not.toContain("editor_in_chief");
  });

  test("ORCHESTRATOR_NAME is editor_in_chief", () => {
    expect(ORCHESTRATOR_NAME).toBe("editor_in_chief");
  });

  test("QA_AGENTS includes copy_editor and managing_editor", () => {
    expect(QA_AGENTS).toContain("copy_editor");
    expect(QA_AGENTS).toContain("managing_editor");
    expect(QA_AGENTS).not.toContain("writer");
    expect(QA_AGENTS).not.toContain("researcher");
  });

  test("PIPELINE_AGENTS includes researcher, writer, and fact_checker", () => {
    expect(PIPELINE_AGENTS).toContain("researcher");
    expect(PIPELINE_AGENTS).toContain("writer");
    expect(PIPELINE_AGENTS).toContain("fact_checker");
    expect(PIPELINE_AGENTS).not.toContain("editor_in_chief");
  });

  test("isQAAgent returns true for copy_editor and managing_editor", () => {
    expect(isQAAgent("copy_editor")).toBe(true);
    expect(isQAAgent("managing_editor")).toBe(true);
    expect(isQAAgent("researcher")).toBe(false);
    expect(isQAAgent("writer")).toBe(false);
  });

  test("isSubagent returns false for editor_in_chief", () => {
    expect(isSubagent("editor_in_chief")).toBe(false);
  });

  test("isSubagent returns true for all other agents", () => {
    expect(isSubagent("sme")).toBe(true);
    expect(isSubagent("humanizer")).toBe(true);
    expect(isSubagent("copy_editor")).toBe(true);
    expect(isSubagent("managing_editor")).toBe(true);
    expect(isSubagent("researcher")).toBe(true);
    expect(isSubagent("writer")).toBe(true);
    expect(isSubagent("fact_checker")).toBe(true);
  });
});
