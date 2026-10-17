/**
 * Tavily `country` vocabulary tests.
 *
 * Regression guard for: any query that merely *mentioned* a country failed with
 * `bad-request: Tavily: Invalid country. Must be a valid country name from the
 * list of supported countries`. The shared locale hint is ISO 3166-1 alpha-2
 * ("FR"), but Tavily only accepts lowercase English names ("france"), so the
 * raw code was forwarded and rejected before retrieval ran.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { extractSearchHints } from "../src/host/search-hints.ts";
import { buildTavilySearchBody, resolveTavilyCountry } from "../src/host/providers/tavily.ts";

test("buildTavilySearchBody translates the alpha-2 hint into Tavily's country name", () => {
  const cases: Array<[query: string, expected: string]> = [
    ["What is the capital of France", "france"],
    ["Who is the current president of Japan", "japan"],
    ["美国 latest CPI print", "united states"],
    ["英国 首相 最新", "united kingdom"],
    ["新加坡 房价 走势", "singapore"],
    ["德国 汽车销量", "germany"],
    ["加拿大 移民政策", "canada"],
    ["中国 新能源汽车 销量", "china"],
  ];

  for (const [query, expected] of cases) {
    const body = buildTavilySearchBody(query, 5, undefined, extractSearchHints(query));
    assert.equal(body.country, expected, `${query} should send country="${expected}"`);
    // The query itself must still reach the API untouched by the translation.
    assert.equal(typeof body.query, "string");
  }
});

test("resolveTavilyCountry accepts codes and names, rejects everything else", () => {
  assert.equal(resolveTavilyCountry("FR"), "france");
  assert.equal(resolveTavilyCountry("fr"), "france");
  assert.equal(resolveTavilyCountry("france"), "france");
  assert.equal(resolveTavilyCountry("  United States "), "united states");
  assert.equal(resolveTavilyCountry("US"), "united states");

  // Unknown codes and names must never be forwarded — Tavily answers them with a 400.
  assert.equal(resolveTavilyCountry("XX"), undefined);
  assert.equal(resolveTavilyCountry("atlantis"), undefined);
  assert.equal(resolveTavilyCountry(""), undefined);
  assert.equal(resolveTavilyCountry(undefined), undefined);
});

test("an unmappable country hint is dropped from the body instead of failing the search", () => {
  const body = buildTavilySearchBody("capital of nowhere", 5, undefined, {
    locale: { country: "XX" },
  });
  assert.equal("country" in body, false);
});

test("country is omitted for news and finance topics, where Tavily ignores it", () => {
  const newsQuery = "Japan breaking news this week";
  const newsBody = buildTavilySearchBody(newsQuery, 5, undefined, extractSearchHints(newsQuery, new Date("2026-10-18T00:00:00Z")));
  assert.equal(newsBody.topic, "news");
  assert.equal("country" in newsBody, false);

  const financeQuery = "Japan 财报";
  const financeBody = buildTavilySearchBody(financeQuery, 5, undefined, extractSearchHints(financeQuery));
  assert.equal(financeBody.topic, "finance");
  assert.equal("country" in financeBody, false);
});

test("multi-country and global queries still send no country at all", () => {
  for (const query of ["US and China trade war", "worldwide AI market trends", "全球 AI 监管"]) {
    const body = buildTavilySearchBody(query, 5, undefined, extractSearchHints(query));
    assert.equal("country" in body, false, `${query} must not be pinned to one country`);
  }
});
