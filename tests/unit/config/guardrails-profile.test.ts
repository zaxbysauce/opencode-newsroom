import { describe, expect, test } from "bun:test";

import { GuardrailsProfileSchema } from "../../../src/config/schema";

describe("guardrails-profile", () => {
  test("Empty object is valid", () => {
    const result = GuardrailsProfileSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  test("Full valid object parses correctly", () => {
    const result = GuardrailsProfileSchema.safeParse({
      max_tool_calls: 100,
      max_duration_minutes: 60,
      max_repetitions: 10,
      max_consecutive_errors: 5,
      warning_threshold: 0.5,
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      max_tool_calls: 100,
      max_duration_minutes: 60,
      max_repetitions: 10,
      max_consecutive_errors: 5,
      warning_threshold: 0.5,
    });
  });

  test("max_tool_calls below min (9) is rejected", () => {
    const result = GuardrailsProfileSchema.safeParse({
      max_tool_calls: 9,
    });
    expect(result.success).toBe(false);
  });

  test("max_tool_calls above max (1001) is rejected", () => {
    const result = GuardrailsProfileSchema.safeParse({
      max_tool_calls: 1001,
    });
    expect(result.success).toBe(false);
  });

  test("max_duration_minutes below min (1) is rejected", () => {
    const result = GuardrailsProfileSchema.safeParse({
      max_duration_minutes: 0,
    });
    expect(result.success).toBe(false);
  });

  test("warning_threshold outside range (0.0 and 1.0) is rejected", () => {
    const result = GuardrailsProfileSchema.safeParse({
      warning_threshold: 0.0,
    });
    expect(result.success).toBe(false);

    const result2 = GuardrailsProfileSchema.safeParse({
      warning_threshold: 1.0,
    });
    expect(result2.success).toBe(false);
  });

  test("Non-number fields are rejected", () => {
    const result = GuardrailsProfileSchema.safeParse({
      max_tool_calls: "100" as any,
    });
    expect(result.success).toBe(false);
  });
});
