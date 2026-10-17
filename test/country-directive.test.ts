/**
 * `country:` directive tests — the model-specified half of the country chain.
 *
 * DSH's `web_search` schema takes only `queries: string[]`, so a provider plugin
 * cannot add a `country` argument. The operator is the supported channel, and it
 * has to outrank inference from country names in the query text. Priority:
 *   model directive > mentioned country > provider default > next provider.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { extractSearchHints, parseCountryDirective } from "../src/host/search-hints.ts";
import { buildTavilySearchBody } from "../src/host/providers/tavily.ts";
import { resolveCountryCode, countryName } from "../src/host/countries.ts";
import { countryDirectiveNotice } from "../src/host/country-guidance.ts";

test("resolveCountryCode accepts codes, English names, aliases — and nothing else", () => {
  assert.equal(resolveCountryCode("de"), "DE");
  assert.equal(resolveCountryCode("DE"), "DE");
  assert.equal(resolveCountryCode("germany"), "DE");
  assert.equal(resolveCountryCode("United States"), "US");
  assert.equal(resolveCountryCode("uk"), "GB");
  assert.equal(resolveCountryCode("usa"), "US");
  assert.equal(resolveCountryCode("uae"), "AE");

  assert.equal(resolveCountryCode("zz"), undefined, "unassigned code");
  assert.equal(resolveCountryCode("atlantis"), undefined, "unknown name");
  assert.equal(resolveCountryCode(""), undefined);
  assert.equal(resolveCountryCode(undefined), undefined);
});

test("countryName bridges only the countries Tavily enumerates", () => {
  assert.equal(countryName("DE"), "germany");
  assert.equal(countryName("GB"), "united kingdom");
  assert.equal(countryName("AT"), "austria");
  // Valid alpha-2, but not in Tavily's enumeration → the adapter omits it.
  assert.equal(countryName("GS"), undefined);
});

test("parseCountryDirective reads code and name forms, and keeps trailing query text", () => {
  const code = parseCountryDirective("solar policy country:de 2026");
  assert.equal(code?.code, "DE");
  assert.equal(code?.matched, "country:de");

  const name = parseCountryDirective("housing market country:united kingdom");
  assert.equal(name?.code, "GB");
  assert.equal(name?.matched, "country:united kingdom", "multi-word names are consumed whole");

  const region = parseCountryDirective("region=jp 天気");
  assert.equal(region?.code, "JP");
});

test("parseCountryDirective reports unresolvable values instead of guessing", () => {
  const bad = parseCountryDirective("solar policy country:zz");
  assert.equal(bad?.code, undefined);
  assert.equal(bad?.raw, "zz", "the raw value is kept so the model can be told");

  const empty = parseCountryDirective("solar policy country:");
  assert.equal(empty?.code, undefined);
  assert.equal(empty?.raw, "");
});

test("an explicit directive outranks the country inferred from the query", () => {
  // Mentions France, but the model asked for Japanese sources.
  const hints = extractSearchHints("法国 首都是什么 country:jp");
  assert.equal(hints.locale?.country, "JP");
  assert.equal(hints.cleanQuery, "法国 首都是什么", "directive is stripped from the query");
});

test("an explicit directive also beats multi-country suppression", () => {
  const hints = extractSearchHints("比较中国和美国 AI 政策 country:us");
  assert.equal(hints.locale?.country, "US");
});

test("an invalid directive falls back to inference and is reported to the model", () => {
  const hints = extractSearchHints("法国 首都是什么 country:zz");
  assert.equal(hints.countryDirective?.code, undefined);
  assert.equal(hints.locale?.country, "FR", "inference still applies");
  assert.equal(hints.cleanQuery, "法国 首都是什么", "the invalid token never reaches the provider");

  const notice = countryDirectiveNotice(hints);
  assert.match(notice ?? "", /ignored unrecognised country directive "zz"/);
  assert.match(notice ?? "", /ISO 3166-1 alpha-2/);
});

test("a resolvable directive produces no notice", () => {
  assert.equal(countryDirectiveNotice(extractSearchHints("policy country:de")), undefined);
  assert.equal(countryDirectiveNotice(extractSearchHints("no directive here")), undefined);
});

test("an invalid directive with no country in the text sends no country at all", () => {
  const hints = extractSearchHints("solar policy country:zz");
  assert.equal(hints.locale?.country, undefined);
  const body = buildTavilySearchBody("solar policy country:zz", 5, undefined, hints);
  assert.equal("country" in body, false);
  assert.equal(body.query, "solar policy", "query reaches Tavily without the directive");
});

test("a directive Tavily cannot express is dropped, not forwarded", () => {
  // GS (South Georgia) is a valid alpha-2 but absent from Tavily's enumeration.
  const hints = extractSearchHints("wildlife survey country:gs");
  assert.equal(hints.locale?.country, "GS");
  const body = buildTavilySearchBody("wildlife survey country:gs", 5, undefined, hints);
  assert.equal("country" in body, false);
});
