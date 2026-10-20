/**
 * dsh-web-tools — provider-native option contracts unit tests.
 *
 * Verifies that the UI option values match the Host's sanitizer accept list
 * and the API documentation. These tests are pure JS (no DOM, no React).
 * @module
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRAVE_THRESHOLD_OPTIONS,
  BRAVE_TOKEN_BUDGET_PRESETS,
  PARALLEL_PRIMARY_MODES,
  PARALLEL_EXPERIMENTAL_MODES,
  PARALLEL_ALL_MODES,
  tavilyChunksVisible,
  EXA_SEARCH_TYPE_OPTIONS,
  exaPrimaryMode,
  exaPrimaryApplyable,
} from "../src/client/provider-preferences/contracts.ts";
import { normalizeExaSearchType } from "../src/shared/provider-options.ts";
import { sanitizeProviderOptions } from "../src/host/provider-options.ts";

// ------ Brave content threshold ------
test("Brave: uses disabled not off for the off/threshold value", () => {
  assert.ok(BRAVE_THRESHOLD_OPTIONS.includes("disabled"));
  assert.ok(!BRAVE_THRESHOLD_OPTIONS.includes("off"));
});

test("Brave: accepts the full Brave API enum", () => {
  assert.deepStrictEqual([...BRAVE_THRESHOLD_OPTIONS], ["strict", "balanced", "lenient", "disabled"]);
});

test("Brave: token budget presets include 32K (32768)", () => {
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(32768));
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(16384));
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(8192));
  assert.ok(BRAVE_TOKEN_BUDGET_PRESETS.includes(4096));
});

test("Brave: max token budget matches the API max of 32768", () => {
  assert.strictEqual(Math.max(...BRAVE_TOKEN_BUDGET_PRESETS), 32768);
});

// ------ Parallel mode contracts ------
test("Parallel: primary UI modes are advanced and basic only", () => {
  assert.deepStrictEqual([...PARALLEL_PRIMARY_MODES], ["advanced", "basic"]);
});

test("Parallel: experimental modes are fast and turbo", () => {
  assert.deepStrictEqual([...PARALLEL_EXPERIMENTAL_MODES], ["fast", "turbo"]);
});

test("Parallel: all modes combined match the adapter's full set", () => {
  assert.deepStrictEqual([...PARALLEL_ALL_MODES], ["advanced", "basic", "fast", "turbo"]);
});

// ------ Tavily chunks gating ------
test("Tavily: chunks visible only when depth is advanced AND autoParams is false", () => {
  assert.strictEqual(tavilyChunksVisible("advanced", false), true);
  assert.strictEqual(tavilyChunksVisible("advanced", true), false);
  assert.strictEqual(tavilyChunksVisible("basic", false), false);
  assert.strictEqual(tavilyChunksVisible("basic", true), false);
  assert.strictEqual(tavilyChunksVisible("fast", false), false);
  assert.strictEqual(tavilyChunksVisible("ultra-fast", false), false);
});

// ------ Exa search type contracts ------
test("Exa: search type options are the Exa 3.0 lineup", () => {
  // Exa 3.0 (2026-10-19) retired fast / instant / deep-reasoning; the plugin
  // no longer offers them. Stored legacy values are migrated, not offered.
  assert.deepStrictEqual([...EXA_SEARCH_TYPE_OPTIONS], ["auto", "lite", "deep-lite", "deep"]);
});

test("Exa: legacy stored types normalize onto the 3.0 vocabulary", () => {
  assert.strictEqual(normalizeExaSearchType("fast"), "lite");
  assert.strictEqual(normalizeExaSearchType("instant"), "lite");
  assert.strictEqual(normalizeExaSearchType("deep-reasoning"), "deep");
  assert.strictEqual(normalizeExaSearchType("auto"), "auto");
  assert.strictEqual(normalizeExaSearchType("lite"), "lite");
  assert.strictEqual(normalizeExaSearchType("deep-lite"), "deep-lite");
  assert.strictEqual(normalizeExaSearchType("deep"), "deep");
  assert.strictEqual(normalizeExaSearchType("nonsense"), undefined);
  assert.strictEqual(normalizeExaSearchType(42), undefined);
});

test("Exa: host sanitizer migrates legacy values instead of dropping them", () => {
  // A user who picked "fast" before v0.3.9 keeps the low-latency intent.
  assert.deepStrictEqual(sanitizeProviderOptions("exa", { searchType: "fast" }), { searchType: "lite" });
  assert.deepStrictEqual(sanitizeProviderOptions("exa", { searchType: "instant" }), { searchType: "lite" });
  assert.deepStrictEqual(sanitizeProviderOptions("exa", { searchType: "deep-reasoning" }), { searchType: "deep" });
  // Current values pass through untouched.
  assert.deepStrictEqual(sanitizeProviderOptions("exa", { searchType: "deep-lite" }), { searchType: "deep-lite" });
  // Unknown values are dropped.
  assert.deepStrictEqual(sanitizeProviderOptions("exa", { searchType: "agent" }), {});
});

test("Exa: primary mode mapping buckets lite as fast and deep variants as deep", () => {
  assert.strictEqual(exaPrimaryMode("auto"), "auto");
  assert.strictEqual(exaPrimaryMode("lite"), "fast");
  assert.strictEqual(exaPrimaryMode("deep-lite"), "deep");
  assert.strictEqual(exaPrimaryMode("deep"), "deep");
  // Legacy values still bucket correctly (migration path).
  assert.strictEqual(exaPrimaryMode("fast"), "fast");
  assert.strictEqual(exaPrimaryMode("instant"), "fast");
  assert.strictEqual(exaPrimaryMode("deep-reasoning"), "deep");
});

test("Exa: lossless guard prevents deep from overwriting precise deep variants", () => {
  // Safe: "deep" clicked while current is auto → allowed
  assert.strictEqual(exaPrimaryApplyable("deep", "auto"), true);
  // Safe: "fast" clicked while current is deep-lite → allowed (user explicitly switches)
  assert.strictEqual(exaPrimaryApplyable("fast", "deep-lite"), true);
  // Blocked: "deep" clicked while current is deep-lite → lossless, blocked
  assert.strictEqual(exaPrimaryApplyable("deep", "deep-lite"), false);
  // Blocked: "deep" clicked while current is deep → blocked (no-op, but harmless)
  assert.strictEqual(exaPrimaryApplyable("deep", "deep"), false);
  // Blocked: legacy deep-reasoning migrates to deep, so plain deep must not overwrite it
  assert.strictEqual(exaPrimaryApplyable("deep", "deep-reasoning"), false);
});