import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { createNewsroomCommandHandler } from "../../../src/commands/index";
import { handleAgentsCommand } from "../../../src/commands/agents";
import { handleConfigCommand } from "../../../src/commands/config";
import { handleResetCommand } from "../../../src/commands/reset";

describe("createNewsroomCommandHandler", () => {
  const dummyAgents = {
    editor_in_chief: {
      name: "editor_in_chief",
      description: "Manages the publication workflow",
      config: {
        model: "gpt-4",
        temperature: 0.7,
        prompt: "You are the editor in chief",
      },
    },
  };

  test("should return a function", () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    expect(typeof handler).toBe("function");
  });

  test("should ignore non-newsroom commands", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler({ command: "other", sessionID: "123", arguments: "" }, output);
    expect(output.parts).toEqual([]);
  });

  test("should return HELP_TEXT when no subcommand given", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler({ command: "newsroom", sessionID: "123", arguments: "" }, output);
    expect(output.parts.length).toBeGreaterThan(0);
  });

  test("should return HELP_TEXT for unknown subcommands", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler(
      { command: "newsroom", sessionID: "123", arguments: "foobar" },
      output,
    );
    expect(output.parts.length).toBeGreaterThan(0);
  });

  test("should dispatch 'agents' subcommand", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler(
      { command: "newsroom", sessionID: "123", arguments: "agents" },
      output,
    );
    expect(output.parts.length).toBeGreaterThan(0);
  });

  test("should dispatch 'config' subcommand", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler(
      { command: "newsroom", sessionID: "123", arguments: "config" },
      output,
    );
    expect(output.parts.length).toBeGreaterThan(0);
  });

  test("should dispatch 'reset' subcommand", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler(
      { command: "newsroom", sessionID: "123", arguments: "reset" },
      output,
    );
    expect(output.parts.length).toBeGreaterThan(0);
  });

  test("should dispatch 'diagnose' subcommand", async () => {
    const handler = createNewsroomCommandHandler(".", dummyAgents);
    const output = { parts: [] };
    await handler(
      { command: "newsroom", sessionID: "123", arguments: "diagnose" },
      output,
    );
    expect(output.parts.length).toBeGreaterThan(0);
  });
});

describe("handleAgentsCommand", () => {
  test("returns 'No agents registered.' for empty agents", () => {
    const result = handleAgentsCommand({});
    expect(result).toBe("No agents registered.");
  });

  test("returns markdown with agent name, model, temperature for single agent", () => {
    const agent = {
      name: "researcher",
      description: "Conducts research",
      config: {
        model: "gpt-4-turbo",
        temperature: 0.5,
        prompt: "You are a researcher",
      },
    };
    const result = handleAgentsCommand({ researcher: agent });
    expect(result).toContain("researcher");
    expect(result).toContain("gpt-4-turbo");
    expect(result).toContain("0.5");
  });

  test("shows '🔒 read-only' for agent with tools: { write: false }", () => {
    const agent = {
      name: "reviewer",
      description: "Reviews content",
      config: {
        model: "gpt-3.5-turbo",
        temperature: 0.3,
        tools: { write: false },
      },
    };
    const result = handleAgentsCommand({ reviewer: agent });
    expect(result).toContain("🔒 read-only");
  });

  test("shows '✏️ read-write' for agent with no tool restrictions", () => {
    const agent = {
      name: "writer",
      description: "Writes content",
      config: {
        model: "gpt-4",
        temperature: 0.7,
        tools: {},
      },
    };
    const result = handleAgentsCommand({ writer: agent });
    expect(result).toContain("✏️ read-write");
  });

  test("shows guardrail profiles section when guardrails are provided", () => {
    const agent = {
      name: "manager",
      description: "Manages workflow",
      config: {
        model: "gpt-4",
        temperature: 0.5,
      },
    };
    const guardrails = {
      enabled: true,
      profiles: {
        strict: {
          max_tool_calls: 10,
          max_duration_minutes: 5,
        },
      },
    };
    const result = handleAgentsCommand({ workflow_agent: agent }, guardrails);
    expect(result).toContain("Guardrail Profiles");
    expect(result).toContain("strict");
  });

  test("does not show guardrail section when guardrails are not provided", () => {
    const agent = {
      name: "simple_agent",
      description: "Simple agent",
      config: {
        model: "gpt-3.5-turbo",
        temperature: 0.3,
      },
    };
    const result = handleAgentsCommand({ simple_agent: agent });
    expect(result).not.toContain("Guardrail Profiles");
  });

  test("lists multiple agents correctly", () => {
    const agents = {
      editor_in_chief: {
        name: "editor_in_chief",
        description: "Manages publication",
        config: {
          model: "gpt-4",
          temperature: 0.7,
        },
      },
      researcher: {
        name: "researcher",
        description: "Conducts research",
        config: {
          model: "gpt-4-turbo",
          temperature: 0.5,
        },
      },
    };
    const result = handleAgentsCommand(agents);
    expect(result).toContain("editor_in_chief");
    expect(result).toContain("researcher");
  });

  test("shows temperature when provided", () => {
    const agent = {
      name: "agent_with_temp",
      description: "Has temperature",
      config: {
        model: "gpt-4",
        temperature: 0.9,
      },
    };
    const result = handleAgentsCommand({ agent_with_temp: agent });
    expect(result).toContain("0.9");
  });

  test("shows 'default' for temperature when not provided", () => {
    const agent = {
      name: "agent_no_temp",
      description: "No temperature",
      config: {
        model: "gpt-3.5-turbo",
      },
    };
    const result = handleAgentsCommand({ agent_no_temp: agent });
    expect(result).toContain("temp: default");
  });
});

describe("handleConfigCommand", () => {
  test("returns string containing '## Newsroom Configuration'", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      const result = await handleConfigCommand(tempDir, []);
      expect(result).toContain("## Newsroom Configuration");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns string containing 'Resolved Config'", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      const result = await handleConfigCommand(tempDir, []);
      expect(result).toContain("Resolved Config");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("works with empty directory (null resolved config)", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      const result = await handleConfigCommand(tempDir, []);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("works with non-empty directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      // Create a minimal state directory
      const stateDir = path.join(tempDir, ".newsroom");
      fs.mkdirSync(stateDir, { recursive: true });
      const result = await handleConfigCommand(tempDir, []);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("handleResetCommand", () => {
  test("returns warning message without --confirm flag", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      const result = await handleResetCommand(tempDir, []);
      expect(result).toContain("To confirm, run");
      expect(result).toContain("--confirm");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns 'not found (skipped)' with --confirm flag on empty directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      const result = await handleResetCommand(tempDir, ["--confirm"]);
      expect(result).toContain("not found (skipped)");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns results with --confirm flag on non-empty directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      // Create a minimal state directory
      const stateDir = path.join(tempDir, ".newsroom");
      fs.mkdirSync(stateDir, { recursive: true });
      const result = await handleResetCommand(tempDir, ["--confirm"]);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns results with --confirm flag on directory with state files", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "newsroom-test-"));
    try {
      // Create a minimal state directory with files
      const stateDir = path.join(tempDir, ".newsroom");
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, "plan.md"), "# Test Plan");
      const result = await handleResetCommand(tempDir, ["--confirm"]);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
