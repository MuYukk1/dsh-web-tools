/**
 * dsh-web-tools — Tavily provider adapter.
 *
 * API reference: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * - Base URL: https://api.tavily.com
 * - Auth: `Authorization: Bearer tvly-...` (verified 2026-08-20)
 * - POST /search — search_depth basic/advanced/fast/ultra-fast, chunks_per_source
 * - POST /extract — URL extraction for web_fetch
 *
 * Error codes (verified):
 *   400 bad request, 401 auth, 429 rate-limit,
 *   432 plan limit exceeded, 433 paygo limit exceeded, 500 server
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { TavilyProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Tavily's `country` parameter is NOT an ISO 3166-1 alpha-2 code. It takes a
 * lowercase English country name from a fixed enumeration:
 *
 *   "Boost search results from a specific country. This will prioritize content
 *    from the selected country in the search results. Available only if topic is
 *    `general`." — https://docs.tavily.com/documentation/api-reference/endpoint/search
 *
 * Our canonical form is alpha-2 (what Brave, Exa, Firecrawl and You.com expect),
 * so the vocabularies are bridged in `../countries.ts`. Forwarding the raw code
 * made every query that merely mentioned a country fail outright:
 *
 *   bad-request: Tavily: Invalid country. Must be a valid country name from the
 *   list of supported countries
 *
 * — a hard 400 before retrieval ever ran. Anything Tavily does not enumerate is
 * dropped rather than forwarded: losing a ranking nudge is much cheaper than
 * losing the whole search.
 */
export declare function resolveTavilyCountry(country: string | undefined): string | undefined;
/**
 * Build the POST request body for Tavily's /search endpoint.
 * Supports:
 *  - search_depth: "basic" | "advanced" | "fast" | "ultra-fast"
 *  - chunks_per_source: supported on basic, advanced, fast (not ultra-fast)
 *  - topic: "news" | "finance" from hints (code falls back to general)
 *  - time_range: "day" | "week" | "month" | "year"
 *  - start_date: RFC3339 / YYYY-MM-DD from hints
 *  - include_domains / exclude_domains
 *  - country: translated from the alpha-2 hint (see resolveTavilyCountry)
 */
export declare function buildTavilySearchBody(query: string, maxResults: number | undefined, options?: Readonly<TavilyProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const TAVILY_META: {
    readonly name: "tavily";
    readonly label: "Tavily";
    readonly description: "AI-optimized web search (chunks & depth)";
    readonly credSuffix: "TAVILY";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const TavilyProvider: ProviderAdapter;
