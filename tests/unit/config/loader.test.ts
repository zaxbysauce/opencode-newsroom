import { describe, expect, test } from "bun:test";

import { deepMerge, MAX_CONFIG_FILE_BYTES, MAX_MERGE_DEPTH } from "../../../src/config/loader";

describe("loader", () => {
  describe("constants", () => {
    test("MAX_CONFIG_FILE_BYTES equals 102400", () => {
      expect(MAX_CONFIG_FILE_BYTES).toBe(102400);
    });

    test("MAX_MERGE_DEPTH equals 10", () => {
      expect(MAX_MERGE_DEPTH).toBe(10);
    });
  });

  describe("deepMerge", () => {
    test("returns override when base is undefined", () => {
      const result = deepMerge(undefined, { key: "value" });
      expect(result).toEqual({ key: "value" });
    });

    test("returns base when override is undefined", () => {
      const base = { key: "value" };
      const result = deepMerge(base, undefined);
      expect(result).toEqual(base);
    });

    test("returns undefined when both are undefined", () => {
      const result = deepMerge(undefined, undefined);
      expect(result).toBeUndefined();
    });

    test("shallow merges flat objects", () => {
      const base = { a: 1, b: 2 };
      const override = { b: 3, c: 4 };
      const result = deepMerge(base, override);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test("deep merges nested objects", () => {
      const base = { a: { b: 1, c: 2 } };
      const override = { a: { c: 3, d: 4 } };
      const result = deepMerge(base, override);
      expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
    });

    test("overrides arrays (does not merge them)", () => {
      const base = { items: [1, 2, 3] };
      const override = { items: [4, 5] };
      const result = deepMerge(base, override);
      expect(result).toEqual({ items: [4, 5] });
    });

    test("override wins for conflicting scalar keys", () => {
      const base = { key: "base" };
      const override = { key: "override" };
      const result = deepMerge(base, override);
      expect(result).toEqual({ key: "override" });
    });
  });
});
