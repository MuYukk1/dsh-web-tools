/**
 * dsh-web-tools — SearchHints semantic extraction layer.
 *
 * Deterministic, zero-LLM lightweight semantic extraction from user queries.
 * Extracts high-confidence hints:
 *  - topic: "code" | "news" | "finance" | "research" | "general"
 *  - freshness: preset ("day" | "week" | "month" | "year"), after_date (YYYY-MM-DD), before_date
 *  - domains: include (hard filter, e.g. site:github.com), exclude (-site:), prefer (soft preference, e.g. "官方文档/official docs")
 *  - locale: language, country
 *  - cleanQuery: query with syntax operators (site:, -site:) stripped for pure keyword matching
 *
 * Principle: ONLY explicit constraints become hard filters (include/exclude domains).
 * Soft preferences (preferDomains / official sources) steer the objective rather than killing recall.
 * @module
 */
export type SearchTopic = "general" | "news" | "finance" | "code" | "research";
export type PlatformHint = "xiaohongshu" | "x";
export type FreshnessPreset = "day" | "week" | "month" | "year";
export interface FreshnessHint {
    preset?: FreshnessPreset;
    /** RFC 3339 date string YYYY-MM-DD */
    after?: string;
    /** RFC 3339 date string YYYY-MM-DD */
    before?: string;
}
export interface DomainHints {
    /** Hard filter: results MUST come from these domains (e.g. from site:foo.com) */
    include?: string[];
    /** Hard filter: results MUST NOT come from these domains (e.g. from -site:bar.com) */
    exclude?: string[];
    /** Soft preference: prefer/boost these domains or official primary documentation */
    prefer?: string[];
    /** Whether the query explicitly preferred official/primary documentation */
    preferOfficial?: boolean;
}
export interface LocaleHint {
    language?: string;
    /** ISO 3166-1 alpha-2, from the model's `country:` directive or inferred from the query. */
    country?: string;
}
export interface SearchHints {
    topic?: SearchTopic;
    platform?: PlatformHint;
    /** Whether the query explicitly targeted the platform (e.g. "小红书", "推特", "site:x.com") */
    platformExplicit?: boolean;
    freshness?: FreshnessHint;
    domains?: DomainHints;
    locale?: LocaleHint;
    /**
     * The `country:` / `region:` directive the model wrote, if any.
     * `code` is absent when the value did not resolve — the caller should fall
     * back to inference (and may tell the model the value was ignored).
     */
    countryDirective?: CountryDirective;
    /** Cleaned query string with explicit operators (e.g. site:) removed */
    cleanQuery: string;
    /** The original unmodified query */
    rawQuery: string;
}
/**
 * Format a Date object to YYYY-MM-DD
 */
export declare function formatDateYMD(d: Date): string;
/**
 * Calculate an after_date string from a preset relative to a reference date.
 */
export declare function calculateAfterDate(preset: FreshnessPreset, now?: Date): string;
/** Result of parsing a `country:` directive out of a query. */
export interface CountryDirective {
    /** Text as written after the operator, e.g. "de" or "united states". */
    raw: string;
    /** Canonical alpha-2 code, or `undefined` when the value did not resolve. */
    code?: string;
    /** Exact substring to strip from the clean query. */
    matched: string;
}
/**
 * Parse the first `country:` / `region:` directive.
 *
 * The value may be a code or an English name, and may be followed by more query
 * text ("country:de solar policy"), so the longest token prefix that resolves to
 * a known country wins. An unresolvable value still reports `raw` with no
 * `code`: the directive is stripped from the query either way, and callers fall
 * through to inference instead of forwarding something the API would reject.
 */
export declare function parseCountryDirective(query: string): CountryDirective | undefined;
/**
 * Extract structured SearchHints from a raw query.
 * Pure function: deterministic, fast, testable, zero side-effects.
 */
export declare function extractSearchHints(query: string, now?: Date): SearchHints;
