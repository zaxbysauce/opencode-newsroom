import { describe, expect, test } from "bun:test";

import { EvidenceConfigSchema } from "../../../src/config/evidence-config";

describe("evidence-config", () => {
  test("Valid empty object gets defaults", () => {
    const result = EvidenceConfigSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      enabled: true,
      max_age_days: 90,
      max_bundles: 1000,
      auto_archive: false,
    });
  });

  test("Valid full object parses correctly", () => {
    const result = EvidenceConfigSchema.parse({
      enabled: true,
      max_age_days: 180,
      max_bundles: 5000,
      auto_archive: true,
    });

    expect(result.enabled).toBe(true);
    expect(result.max_age_days).toBe(180);
    expect(result.max_bundles).toBe(5000);
    expect(result.auto_archive).toBe(true);
  });

  test("Invalid max_age_days (0) is rejected", () => {
    const result = EvidenceConfigSchema.safeParse({ max_age_days: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("Invalid max_age_days (366) is rejected", () => {
    const result = EvidenceConfigSchema.safeParse({ max_age_days: 366 });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("Invalid max_bundles (9) is rejected", () => {
    const result = EvidenceConfigSchema.safeParse({ max_bundles: 9 });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("Invalid max_bundles (10001) is rejected", () => {
    const result = EvidenceConfigSchema.safeParse({ max_bundles: 10001 });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("Non-boolean enabled is rejected", () => {
    const result = EvidenceConfigSchema.safeParse({ enabled: "true" as any });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("Non-number max_age_days is rejected", () => {
    const result = EvidenceConfigSchema.safeParse({ max_age_days: "180" as any });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
