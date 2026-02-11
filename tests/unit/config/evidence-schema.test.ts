import { describe, expect, test } from "bun:test";

import {
  EvidenceSchema,
  ReviewEvidenceSchema,
  TestEvidenceSchema,
  DiffEvidenceSchema,
  ApprovalEvidenceSchema,
  NoteEvidenceSchema,
  EvidenceBundleSchema,
} from "../../../src/config/evidence-schema";

describe("evidence-schema", () => {
  test("Valid review evidence", () => {
    const schema = ReviewEvidenceSchema.safeParse({
      task_id: "task-123",
      type: "review",
      timestamp: new Date().toISOString(),
      agent: "reviewer",
      verdict: "pass",
      summary: "Code review completed",
      risk: "medium",
      issues: [{ severity: "error", message: "Missing null check" }, { severity: "warning", message: "Naming convention" }],
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.task_id).toBe("task-123");
      expect(schema.data.type).toBe("review");
      expect(schema.data.verdict).toBe("pass");
      expect(schema.data.risk).toBe("medium");
      expect(schema.data.issues).toEqual([{ severity: "error", message: "Missing null check" }, { severity: "warning", message: "Naming convention" }]);
    }
  });

  test("Valid test evidence", () => {
    const schema = TestEvidenceSchema.safeParse({
      task_id: "task-123",
      type: "test",
      timestamp: new Date().toISOString(),
      agent: "test_engineer",
      verdict: "pass",
      summary: "Tests passed",
      tests_passed: 15,
      tests_failed: 0,
      test_file: "src/index.test.ts",
      failures: [],
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.type).toBe("test");
      expect(schema.data.tests_passed).toBe(15);
      expect(schema.data.tests_failed).toBe(0);
      expect(schema.data.test_file).toBe("src/index.test.ts");
      expect(schema.data.failures).toEqual([]);
    }
  });

  test("Valid approval evidence", () => {
    const schema = ApprovalEvidenceSchema.safeParse({
      task_id: "task-123",
      type: "approval",
      timestamp: new Date().toISOString(),
      agent: "approver",
      verdict: "approved",
      summary: "Code approved for merge",
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.type).toBe("approval");
    }
  });

  test("Valid note evidence", () => {
    const schema = NoteEvidenceSchema.safeParse({
      task_id: "task-123",
      type: "note",
      timestamp: new Date().toISOString(),
      agent: "note_taker",
      verdict: "info",
      summary: "Meeting notes recorded",
      metadata: {
        meeting_link: "https://example.com/meeting",
        participants: ["alice", "bob"],
      },
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.type).toBe("note");
      expect(schema.data.metadata?.meeting_link).toBe("https://example.com/meeting");
    }
  });

  test("Invalid type rejected by discriminated union", () => {
    const schema = EvidenceSchema.safeParse({
      task_id: "task-123",
      type: "invalid_type",
      timestamp: new Date().toISOString(),
      agent: "agent",
      verdict: "pass",
      summary: "Invalid type",
    });

    expect(schema.success).toBe(false);
  });

  test("Missing required field rejected", () => {
    const schema = EvidenceSchema.safeParse({
      task_id: "task-123",
      type: "review",
      timestamp: new Date().toISOString(),
      agent: "agent",
      verdict: "pass",
      summary: "Missing task_id",
    });

    expect(schema.success).toBe(false);
  });

  test("Invalid verdict rejected", () => {
    const schema = EvidenceSchema.safeParse({
      task_id: "task-123",
      type: "review",
      timestamp: new Date().toISOString(),
      agent: "agent",
      verdict: "invalid_verdict",
      summary: "Invalid verdict",
    });

    expect(schema.success).toBe(false);
  });

  test("EvidenceBundleSchema valid parse", () => {
    const schema = EvidenceBundleSchema.safeParse({
      schema_version: "1.0.0",
      task_id: "task-123",
      entries: [
        {
          task_id: "task-123",
          type: "review",
          timestamp: new Date().toISOString(),
          agent: "reviewer",
          verdict: "pass",
          summary: "Review entry 1",
          risk: "low",
          issues: [],
        },
        {
          task_id: "task-123",
          type: "test",
          timestamp: new Date().toISOString(),
          agent: "test_engineer",
          verdict: "pass",
          summary: "Test entry 1",
          tests_passed: 8,
          tests_failed: 0,
          failures: [],
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.schema_version).toBe("1.0.0");
      expect(schema.data.task_id).toBe("task-123");
      expect(schema.data.entries).toHaveLength(2);
    }
  });

  test("EvidenceBundleSchema with empty entries", () => {
    const schema = EvidenceBundleSchema.safeParse({
      schema_version: "1.0.0",
      task_id: "task-123",
      entries: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.entries).toEqual([]);
    }
  });

  test("Valid diff evidence", () => {
    const schema = DiffEvidenceSchema.safeParse({
      task_id: "task-123",
      type: "diff",
      timestamp: new Date().toISOString(),
      agent: "developer",
      verdict: "pass",
      summary: "Changes reviewed",
      files_changed: ["src/index.ts", "src/utils.ts"],
      additions: 42,
      deletions: 12,
      patch_path: "src.patch",
    });

    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.type).toBe("diff");
      expect(schema.data.files_changed).toEqual(["src/index.ts", "src/utils.ts"]);
      expect(schema.data.additions).toBe(42);
      expect(schema.data.deletions).toBe(12);
      expect(schema.data.patch_path).toBe("src.patch");
    }
  });
});
