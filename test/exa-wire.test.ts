import test from "node:test";
import assert from "node:assert/strict";
import { ExaProvider, buildExaSearchBody, formatExaNotices } from "../src/host/providers/exa.ts";

test("ExaProvider search uses headers and parses highlights", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    capturedBody = JSON.parse(init?.body as string);

    return {
      status: 200,
      ok: true,
      json: async () => ({
        results: [
          {
            url: "https://example.com/item1",
            title: "Item 1",
            highlights: [
              "Sentence 1 with high significance.",
              "Sentence 2 providing detailed context.",
            ],
            publishedDate: "2026-03-01T00:00:00.000Z",
          },
          {
            url: "https://example.com/item2",
            title: "Item 2",
            text: "Fallback text when highlights are empty.",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await ExaProvider.search("test query", 10, "test-exa-key", undefined);

    assert.equal(capturedUrl, "https://api.exa.ai/search");
    assert.equal(capturedHeaders["x-api-key"], "test-exa-key");
    assert.equal(capturedBody.query, "test query");
    assert.equal(capturedBody.type, "auto");
    assert.equal(capturedBody.numResults, 10);
    assert.deepEqual(capturedBody.contents, {
      highlights: true,
    });

    assert.equal(outcome.sources.length, 2);
    // highlight paragraphs joined with \n\n
    assert.equal(
      outcome.sources[0].snippet,
      "Sentence 1 with high significance.\n\nSentence 2 providing detailed context."
    );
    assert.equal(outcome.sources[0].publishedAt, "2026-03-01T00:00:00.000Z");
    assert.equal(outcome.sources[1].snippet, "Fallback text when highlights are empty.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Exa 3.0: lite type is sent and freshness params lite rejects are omitted", async () => {
  let capturedBody: any = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(init?.body as string);
    return { status: 200, ok: true, json: async () => ({ results: [] }) } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    await ExaProvider.search("q", 10, "k", undefined, {
      options: { searchType: "lite", maxAgeHours: 24 },
    });
    assert.equal(capturedBody.type, "lite");
    // lite serves cached content only and rejects freshness parameters with
    // a 400 — maxAgeHours must never reach the wire on lite.
    assert.deepEqual(capturedBody.contents, { highlights: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("non-lite Exa types keep maxAgeHours (incl. live = 0)", () => {
  const auto = buildExaSearchBody("q", 10, { searchType: "auto", maxAgeHours: 24 });
  assert.deepEqual(auto.contents, { highlights: true, maxAgeHours: 24 });

  const def = buildExaSearchBody("q", 10, { maxAgeHours: 0 });
  assert.equal(def.type, "auto");
  assert.deepEqual(def.contents, { highlights: true, maxAgeHours: 0 });

  const deep = buildExaSearchBody("q", 10, { searchType: "deep", maxAgeHours: -1 });
  assert.deepEqual(deep.contents, { highlights: true, maxAgeHours: -1 });
});

test("Exa 3.0 notices are surfaced on SearchOutcome.content; warnings are not", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      status: 200,
      ok: true,
      json: async () => ({
        results: [{ url: "https://example.com", title: "Example" }],
        notices: [{ message: "No page matched site:example.com" }, "duplicate-format-string"],
        warnings: [{ code: "IGNORED_FIELD", message: "startCrawlDate has no effect" }],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await ExaProvider.search("q", 10, "k", undefined);
    assert.equal(outcome.sources.length, 1);
    assert.equal(outcome.content, "Exa: No page matched site:example.com | duplicate-format-string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no notices → SearchOutcome carries no content key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      status: 200,
      ok: true,
      json: async () => ({ results: [{ url: "https://example.com" }] }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await ExaProvider.search("q", 10, "k", undefined);
    assert.equal(outcome.content, undefined);
    assert.ok(!("content" in outcome));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formatExaNotices: defensive field read, dedupe, and empty handling", () => {
  assert.equal(formatExaNotices(undefined), undefined);
  assert.equal(formatExaNotices([]), undefined);
  assert.equal(formatExaNotices([null, 42]), undefined);

  assert.equal(
    formatExaNotices([{ message: "a" }, { description: "b" }, { text: "c" }, "a", { unknown: { nested: 1 } }]),
    'Exa: a | b | c | {"unknown":{"nested":1}}',
  );
});
