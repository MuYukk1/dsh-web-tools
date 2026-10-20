/**
 * dsh-web-tools — Exa provider adapter (neural/semantic search).
 *
 * Canonical reference: https://docs.exa.ai/reference/search
 * - POST https://api.exa.ai/search with `x-api-key` header (canonical raw REST)
 * - Content mode: `contents.highlights = true` (token-efficient extractive highlights;
 *   Exa 3.0 upgrades this to cross-result Dynamic Highlights at no charge)
 * - `type: "auto"` for balanced neural / keyword retrieval. Exa 3.0 recommends
 *   `auto` / `lite` / `deep`; `fast` / `instant` / `deep-reasoning` are legacy
 *   but still served, so existing user settings keep working.
 * - `type: "lite"` serves cached content only and REJECTS freshness parameters
 *   (a parameter lite does not support returns a 400), so `maxAgeHours` is
 *   omitted for lite instead of forwarded.
 * - Response `notices` explain how results were produced — Exa's docs say to
 *   pass them to the model with the results — so they are surfaced through
 *   SearchOutcome.content. `warnings` are for the integrator, not the model,
 *   and are intentionally not forwarded.
 * - /contents uses `urls` + `text: true` for full-page markdown fetch
 *
 * @module
 */
import { type ProviderAdapter } from "./types.ts";
import type { ExaProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
/**
 * Build the POST request body for Exa /search.
 * Supports:
 *  - query (cleanQuery)
 *  - type: auto / fast / deep etc.
 *  - category: "publication" (research), "news" (news), "financial report" (finance), "company", "people"
 *  - includeDomains / excludeDomains
 *  - startPublishedDate / endPublishedDate (ISO 8601)
 *  - userLocation (country code)
 */
export declare function buildExaSearchBody(query: string, numResults: number, options?: Readonly<ExaProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
/**
 * Flatten an Exa 3.0 `notices` array into one model-facing string.
 *
 * Exa's docs: notices "tell the model reading the results how they were
 * produced" (e.g. when no page matched a `site:` operator and the search ran
 * without it). The item shape is read defensively (`message` / `description`
 * / `text` / raw JSON) so a future field rename degrades to a verbose but
 * harmless note instead of a crash.
 */
export declare function formatExaNotices(notices: unknown): string | undefined;
export declare const EXA_META: {
    readonly name: "exa";
    readonly label: "Exa";
    readonly description: "Semantic / neural web search (highlights & auto search)";
    readonly credSuffix: "EXA";
    readonly fetchCapable: true;
    readonly needsBaseUrl: false;
};
export declare const ExaProvider: ProviderAdapter;
